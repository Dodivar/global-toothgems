import { describe, expect, it } from "vitest";
import type { AdminOrder } from "../data/adminOrders";
import { averageBasket, customerActivity, customerName, trainingState } from "../data/adminCustomers";
import {
  draftOf,
  mapCustomers,
  mapEnrollment,
  mapStatusHistory,
  profilePatch,
  statusFromDb,
  tagDiff,
  tagFromDb,
  tagToDb,
  validateDraft,
  writeErrorOf,
  type CustomerCourseRow,
  type CustomerProfileDraft,
  type CustomerProfileRow,
  type CustomerSources,
} from "./adminCustomerMapping";
import { applyFilters, metrics, readFilters } from "./adminCustomerFilters";

const profile = (overrides: Partial<CustomerProfileRow> = {}): CustomerProfileRow => ({
  id: "u1",
  email: "nora@example.com",
  first_name: " Nora ",
  last_name: "Benali",
  display_name: null,
  phone: "+33 6 12 34 56 78",
  status: "active",
  created_at: "2026-09-12T08:30:00.000+00:00",
  country_code: "FR",
  birth_date: null,
  marketing_opt_in: true,
  ...overrides,
});

const course = (overrides: Partial<CustomerCourseRow> = {}): CustomerCourseRow =>
  ({
    user_id: "u1",
    course_id: "c1",
    title: "Pose",
    title_en: null,
    course_status: "published",
    source: "manual_grant",
    starts_at: "2026-09-20T10:00:00.000+00:00",
    expires_at: null,
    nodes_total: 4,
    nodes_done: 1,
    last_activity: "2026-09-21T10:00:00.000+00:00",
    completed_at: null,
    average_score: null,
    certificate_code: null,
    ...overrides,
  }) as unknown as CustomerCourseRow;

/** The fields of an order the customers workspace reads. */
const order = (overrides: Record<string, unknown> = {}): AdminOrder =>
  ({
    reference: "GT-2026-0001",
    customer: { id: "u1" },
    placedAt: "2026-09-25T09:00:00.000+00:00",
    status: "confirmed",
    currency: "EUR",
    payment: { status: "paid" },
    amounts: { total: 6180, refunded: 0 },
    timeline: [],
    ...overrides,
  }) as unknown as AdminOrder;

const sources = (overrides: Partial<CustomerSources> = {}): CustomerSources => ({
  profiles: [profile()],
  addresses: [],
  tags: [],
  notes: [],
  courses: [],
  orders: [],
  ...overrides,
});

describe("vocabulary", () => {
  it("reads the database statuses and treats anything else as closed", () => {
    expect(statusFromDb("active")).toBe("active");
    expect(statusFromDb("suspended")).toBe("suspended");
    expect(statusFromDb("deactivated")).toBe("deactivated");
    expect(statusFromDb("inactive")).toBe("deactivated");
    expect(statusFromDb(null)).toBe("deactivated");
  });

  it("maps every tag both ways", () => {
    expect(tagToDb("followUp")).toBe("follow_up");
    expect(tagFromDb("training_completed")).toBe("trainingCompleted");
    expect(tagFromDb("unknown")).toBeNull();
    expect(tagDiff(["vip", "repeat"], ["repeat", "followUp"])).toEqual({ add: ["followUp"], remove: ["vip"] });
  });
});

describe("mapCustomers", () => {
  it("maps a profile with its address, tags, notes and seats", () => {
    const [c] = mapCustomers(
      sources({
        addresses: [
          { user_id: "u1", address_line1: "7 quai", address_line2: null, postal_code: "69002", city: "Lyon", country_code: "FR" },
        ],
        tags: [
          { user_id: "u1", tag: "vip" },
          { user_id: "u1", tag: "retired_tag" },
          { user_id: "u2", tag: "repeat" },
        ],
        notes: [
          {
            id: "n2",
            user_id: "u1",
            author_id: "s1",
            body: "Second",
            created_at: "2026-09-27T10:00:00.000+00:00",
            author: { display_name: null, first_name: "Léa", last_name: "Martin", email: "lea@example.com" },
          },
          { id: "n1", user_id: "u1", author_id: null, body: "First", created_at: "2026-09-26T10:00:00.000+00:00", author: null },
        ],
        courses: [course()],
      }),
    );
    expect(c).toMatchObject({
      id: "u1",
      firstName: "Nora",
      since: "2026-09-12",
      country: "fr",
      address: { line1: "7 quai", line2: "", postalCode: "69002", city: "Lyon", country: "fr" },
      status: "active",
      tags: ["vip"],
      marketingOptIn: true,
      orderCount: 0,
      spend: [],
      spendRank: 0,
    });
    expect(c.notes.map((n) => [n.id, n.author])).toEqual([
      ["n1", ""],
      ["n2", "Léa Martin"],
    ]);
    expect(c.enrollments).toHaveLength(1);
  });

  it("takes order count and net spend from the book, per currency, and ranks on euros only", () => {
    const [c] = mapCustomers(
      sources({
        orders: [
          order(),
          order({ reference: "GT-2", amounts: { total: 10000, refunded: 2500 } }),
          order({ reference: "GT-3", currency: "GBP", amounts: { total: 4000, refunded: 0 } }),
          order({ reference: "GT-4", payment: { status: "failed" } }),
          order({ reference: "GT-5", customer: { id: "u2" } }),
        ],
      }),
    );
    expect(c.orderCount).toBe(4);
    expect(c.spend).toEqual([
      { currency: "EUR", amount: 13680 },
      { currency: "GBP", amount: 4000 },
    ]);
    expect(c.spendRank).toBe(13680);
    // Two currencies: no average basket.
    expect(averageBasket(c, [])).toBeNull();
  });

  it("averages the basket over paid orders in one currency", () => {
    const orders = [order(), order({ reference: "GT-2", amounts: { total: 3820, refunded: 0 } })];
    const [c] = mapCustomers(sources({ orders }));
    expect(averageBasket(c, orders)).toEqual({ currency: "EUR", amount: 5000 });
  });

  it("lists the newest registration first and names people without a name by their e-mail", () => {
    const list = mapCustomers(
      sources({
        profiles: [
          profile(),
          profile({ id: "u2", first_name: null, last_name: null, email: "zoe@example.com", created_at: "2026-09-30T08:00:00Z" }),
        ],
      }),
    );
    expect(list.map((c) => c.id)).toEqual(["u2", "u1"]);
    expect(customerName(list[0])).toBe("zoe");
  });
});

describe("seats and history", () => {
  it("uses the learner's progress and the completion record", () => {
    expect(mapEnrollment(course())).toMatchObject({ progress: 25, certificate: false, withdrawn: false });
    expect(mapEnrollment(course({ title_en: "Setting" })).title).toEqual({ fr: "Pose", en: "Setting" });
    expect(mapEnrollment(course({ nodes_total: 0, nodes_done: 0 })).progress).toBe(0);
    const done = mapEnrollment(
      course({ completed_at: "2026-09-28T10:00:00Z", average_score: 86, certificate_code: "GT-ABC", nodes_done: 3 }),
    );
    expect(done).toMatchObject({ progress: 100, score: 86, certificate: true, completedAt: "2026-09-28T10:00:00Z" });
    expect(mapEnrollment(course({ course_status: "unpublished" })).withdrawn).toBe(true);
  });

  it("derives the training state from the seats", () => {
    const seat = mapEnrollment(course());
    expect(trainingState({ enrollments: [] })).toBe("none");
    expect(trainingState({ enrollments: [{ ...seat, progress: 0 }] })).toBe("enrolled");
    expect(trainingState({ enrollments: [seat] })).toBe("inProgress");
    expect(trainingState({ enrollments: [{ ...seat, completedAt: "2026-09-28" }] })).toBe("completed");
  });

  it("puts the audited status changes in the timeline, oldest first", () => {
    const history = mapStatusHistory([
      { changed_at: "2026-09-29T10:00:00Z", old_status: "active", new_status: "suspended", actor_name: "Léa" },
    ]);
    expect(history).toEqual([{ at: "2026-09-29T10:00:00Z", from: "active", to: "suspended", actor: "Léa" }]);
    const [c] = mapCustomers(sources({ orders: [order()] }));
    const events = customerActivity(c, [order()], history);
    expect(events.map((e) => e.kind)).toEqual(["accountCreated", "orderPlaced", "statusChanged"]);
  });
});

describe("profile writes", () => {
  const draft = (overrides: Partial<CustomerProfileDraft> = {}): CustomerProfileDraft => ({
    firstName: "Nora",
    lastName: "Benali",
    phone: "",
    birthDate: "",
    country: "fr",
    status: "active",
    tags: [],
    ...overrides,
  });

  it("mirrors the database checks", () => {
    expect(validateDraft(draft())).toEqual({});
    expect(validateDraft(draft({ firstName: "  ", lastName: "x".repeat(101) }))).toEqual({
      firstName: "required",
      lastName: "tooLong",
    });
    expect(validateDraft(draft({ phone: "call me" }))).toEqual({ phone: "phone" });
    expect(validateDraft(draft({ birthDate: "2024-05-01" }))).toEqual({ birthDate: "birthDate" });
    expect(validateDraft(draft({ birthDate: "1899-12-31" }))).toEqual({ birthDate: "birthDate" });
    expect(validateDraft(draft({ country: "fra" }))).toEqual({ country: "country" });
  });

  it("sends blanks as NULL, the country upper-case, and never the email or consent", () => {
    expect(profilePatch(draft({ firstName: " Nora ", phone: " ", birthDate: "1990-05-01" }))).toEqual({
      first_name: "Nora",
      last_name: "Benali",
      phone: null,
      birth_date: "1990-05-01",
      country_code: "FR",
      status: "active",
    });
    expect(profilePatch(draft({ country: "" })).country_code).toBeNull();
  });

  it("leaves the status of a closed account alone", () => {
    const [closed] = mapCustomers(sources({ profiles: [profile({ status: "deactivated" })] }));
    const start = draftOf(closed);
    expect(start.status).toBeNull();
    expect(profilePatch(start)).not.toHaveProperty("status");
  });

  it("words refusals", () => {
    expect(writeErrorOf({ code: "42501" })).toBe("forbidden");
    expect(writeErrorOf({ code: "PGRST116" })).toBe("forbidden");
    expect(writeErrorOf({ code: "23514" })).toBe("invalid");
    expect(writeErrorOf({ code: "23503" })).toBe("notFound");
    expect(writeErrorOf({ code: "08006" })).toBe("unavailable");
  });
});

describe("filters", () => {
  const list = mapCustomers(
    sources({
      profiles: [
        profile(),
        profile({ id: "u2", status: "suspended", created_at: "2026-01-05T08:00:00Z", email: "max@example.com", first_name: "Max" }),
      ],
      orders: [order({ amounts: { total: 30000, refunded: 0 } }), order({ reference: "GT-2" })],
    }),
  );

  it("filters spend bands in minor units and dates against today", () => {
    expect(applyFilters(list, readFilters(new URLSearchParams("depense=mid")), "2026-10-01").map((c) => c.id)).toEqual(["u1"]);
    expect(applyFilters(list, readFilters(new URLSearchParams("depense=none")), "2026-10-01").map((c) => c.id)).toEqual(["u2"]);
    expect(applyFilters(list, readFilters(new URLSearchParams("periode=last30")), "2026-10-01").map((c) => c.id)).toEqual(["u1"]);
    expect(applyFilters(list, readFilters(new URLSearchParams("statut=suspended")), "2026-10-01").map((c) => c.id)).toEqual(["u2"]);
  });

  it("counts the KPI row from the records", () => {
    expect(metrics(list, "2026-09-30")).toMatchObject({ total: 2, newThisMonth: 1, active: 1, repeat: 1, repeatShare: 50 });
  });
});
