import { isShipment, type Order } from "../data/orders";
import type { Product } from "../data/products";
import { grantsAccess, type StudioAccessKind } from "./studioAccessState";

/**
 * What the member dashboard (`/compte`) chooses to show, as pure rules.
 *
 * The dashboard only shows a card when it says something true and useful about
 * the account — a parcel on its way, a lesson to resume, a reward close or
 * ready, the Studio plan in use — never a bare count (how many orders, how
 * many lessons). Each rule below decides one card from data the stores
 * already read under row-level security; nothing here is written back.
 */

/**
 * Orders with a parcel still to come: standing, physical, not delivered yet.
 * Newest first, like the history they come from.
 */
export function ordersOnTheirWay(orders: readonly Order[]): Order[] {
  return orders.filter((order) => isShipment(order) && (order.status === "processing" || order.status === "shipped"));
}

/** What is worth saying about the favourites: how many, how many on sale, how many nearly gone. */
export interface FavoritesSummary {
  total: number;
  onSale: number;
  lowStock: number;
}

/**
 * "On sale" means what the shop window strikes out: a reduction the database announces (decision 129, Omnibus),
 * passed in as `reduced` — never a price compared here.
 */
export function summarizeFavorites<P extends Pick<Product, "stock">>(products: readonly P[], reduced: (product: P) => boolean = () => false): FavoritesSummary {
  return {
    total: products.length,
    onSale: products.filter((p) => p.stock !== "out" && reduced(p)).length,
    lowStock: products.filter((p) => p.stock === "low").length,
  };
}

/** One completed course of the member, enough to name the certificate it earned. */
export interface EarnedCertificate<C> {
  course: C;
  completedOn: string | null;
}

/**
 * The certificates earned (courses that issue one, completed), the latest
 * first. A completion without a recorded date sorts last.
 */
export function earnedCertificates<C extends { issuesCertificate: boolean }>(
  entries: readonly { course: C; progress: { completed: boolean; completedOn: string | null } }[],
): EarnedCertificate<C>[] {
  return entries
    .filter(({ course, progress }) => course.issuesCertificate && progress.completed)
    .map(({ course, progress }) => ({ course, completedOn: progress.completedOn }))
    .sort((a, b) => (b.completedOn ?? "").localeCompare(a.completedOn ?? ""));
}

/**
 * Whether the Studio card belongs on the dashboard: only for an account that
 * uses the Studio (trial, plan, staff) or is waiting for its plan to open. A
 * member who never tried it, or whose access ended, is not sold to here.
 */
export function showsStudioCard(state: StudioAccessKind): boolean {
  return grantsAccess(state) || state === "subscription_pending";
}
