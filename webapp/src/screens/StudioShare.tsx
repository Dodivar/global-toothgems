import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "../lib/navigation";
import clsx from "clsx";
import { ArrowLeft, Box, Eye, Gem, Link2, LoaderCircle, Minus, Orbit, PencilRuler, Plus, RotateCcw, ScanFace, ShoppingBag, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { useDocumentTitle } from "../components/legal/hooks";
import { FoldedShoppingList } from "../components/studio/editor/ShoppingList";
import { SignInPrompt } from "../components/studio/workspace/SignInPrompt";
import { TryOnAllowance } from "../components/studio/tryOn/TryOnAllowance";
import { StageFullscreenButton } from "../components/studio/StageFullscreenButton";
import { useAuth } from "../lib/auth";
import { isLocale, localizedPath } from "../lib/localeRoutes";
import { useToast } from "../lib/toast";
import { StudioEngine } from "../lib/studio3d/engine";
import { useStageFullscreen } from "../lib/studio3d/stageFullscreen";
import { DesignStore, studioStore } from "../lib/studio3d/store";
import type { TryOnSource } from "../lib/studio3d/tryOn";
import { tryOnExhausted, useTryOnStatus } from "../lib/studio3d/useTryOnStatus";
import { STUDIO_EDITOR_PATH, STUDIO_PATH } from "../lib/studioUrl";
import { piecesKey } from "../lib/studioWorkspace/scene";
import { supabase } from "../lib/supabase/client";
import { decodeSharedDesign, type SharedDesign } from "../lib/studioWorkspace/share";
import { fetchBookingCreation, fetchGlowbookCreation, fetchSharedCreation } from "../lib/studioWorkspace/supabaseRepository";
import { formatWhen } from "../lib/glowbookBookingMapping";
import { AGENDA_PATH } from "../lib/agendaRoutes";
import { BookThisDesign } from "../components/glowbook/BookThisDesign";

const TryOnDialog = lazy(() => import("../components/studio/tryOn/TryOnDialog").then((m) => ({ default: m.TryOnDialog })));

/**
 * A Studio design someone shared, shown read-only: a saved creation behind a
 * token (`/studio-3d/partage/<token>`, read through `studio_shared_creation`,
 * the only door a guest has, which returns that one creation and nothing
 * about its owner), or a snapshot carried in the fragment (`…/partage#…`).
 *
 * The recipient can turn, zoom and light-orbit the composition, nothing more:
 * the engine runs in read-only mode on a store of its own that is never
 * persisted, so opening a link can neither change the shared design nor
 * touch the recipient's own draft. Signed out, the page invites them to sign
 * in to use the Studio; signed in, they can take a copy into their editor.
 *
 * A creation of an artist's public Glowbook (`/studio-3d/glowbook/<handle>/<item>`,
 * decision 99) opens in the same viewer, read through
 * `studio_public_showcase_creation` (approved creations only), with the way
 * back to the Glowbook and without the copy into one's own Studio: it is the
 * artist's published work, not a design sent to the visitor.
 *
 * Every viewer lists the shop items the design takes and puts them in the
 * cart in one click (the editor's `ShoppingList`; the checkout prices them
 * again on the server).
 *
 * A stored creation (Glowbook or share token) whose owner's plan allows it
 * (`try_on`, decided by the database, decision 111) offers "Try it on my
 * smile": the visitor's own photo, rendered by AI. A design
 * carried in the fragment has no server identity and offers none.
 *
 * A client's own creation joined to a Glowbook booking
 * (`/studio-3d/rendez-vous/<booking>`, decision 148) opens here too, read
 * through `glowbook_booking_creation`: the booked artist and the client only,
 * signed in; the artist may take a copy into their Studio to work from it.
 *
 * Open to everyone and outside `RequireStudioAccess`: looking at a design
 * someone sent you is not using the paid tool. Lazy-loaded with three.js.
 */
/** The artist whose Glowbook a creation comes from. */
interface GlowbookAuthor {
  handle: string;
  displayName: string;
}

/** The booking a client's creation is joined to (decision 148), as its viewer sees it. */
interface BookingContext {
  viewer: "artist" | "client";
  /** The other side: the client for the artist, the artist for the client. */
  otherName: string | null;
  startsAt: string | null;
  timezone: string | null;
}

/** The stored creation, as the try-on function finds it, when its owner's plan allows trying it on. */
type TryOn = TryOnSource | null;

type Loaded =
  | { key: string; status: "ready"; design: SharedDesign; author: GlowbookAuthor | null; tryOn: TryOn; booking?: BookingContext | null }
  /** Unknown, disabled or unreadable link. */
  | { key: string; status: "invalid" }
  /** The database could not be reached: worth another try. */
  | { key: string; status: "unavailable" };

type Source = { token?: string; handle?: string; item?: string; booking?: string; hash: string };

async function loadShared({
  token,
  handle,
  item,
  booking,
  hash,
}: Source): Promise<{ design: SharedDesign; author: GlowbookAuthor | null; tryOn: TryOn; booking?: BookingContext | null } | null> {
  if (booking) {
    const found = supabase ? await fetchBookingCreation(supabase, booking) : null;
    if (!found) return null;
    return {
      design: found.design,
      author: null,
      tryOn: null,
      booking: {
        viewer: found.viewer,
        otherName: found.viewer === "artist" ? found.clientName : found.artistName,
        startsAt: found.startsAt,
        timezone: found.timezone,
      },
    };
  }
  if (handle && item) {
    const found = supabase ? await fetchGlowbookCreation(supabase, decodeURIComponent(handle), item) : null;
    if (!found) return null;
    return { ...found, tryOn: found.tryOn ? { kind: "glowbook", handle: found.author.handle, itemId: item } : null };
  }
  if (token) {
    const found = supabase ? await fetchSharedCreation(supabase, token) : null;
    return found ? { design: found.design, author: null, tryOn: found.tryOn ? { kind: "share", token } : null } : null;
  }
  const design = await decodeSharedDesign(hash);
  return design ? { design, author: null, tryOn: null } : null;
}

export function StudioShare() {
  const { t } = useTranslation();
  const { hash } = useLocation();
  const { token, handle, item, booking } = useParams();
  const { signedIn, restoring } = useAuth();
  const stored = !!token || !!(handle && item) || !!booking;
  const [retry, setRetry] = useState(0);
  // A booking's creation is read as the signed-in member: read again once the session is known.
  const key = `${token ?? ""}${handle ?? ""}/${item ?? ""}${booking ?? ""}${hash}#${retry}${booking ? `@${signedIn}` : ""}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const waitForSession = !!booking && restoring;

  useEffect(() => {
    if (waitForSession) return;
    let live = true;
    loadShared({ token, handle, item, booking, hash })
      .then((found) => live && setLoaded(found ? { key, status: "ready", ...found } : { key, status: "invalid" }))
      .catch(() => live && setLoaded({ key, status: stored ? "unavailable" : "invalid" }));
    return () => {
      live = false;
    };
  }, [token, handle, item, booking, hash, key, stored, waitForSession]);

  const current = loaded && loaded.key === key ? loaded : null;
  const design = current?.status === "ready" ? current.design : null;
  const author = current?.status === "ready" ? current.author : null;
  const tryOn = current?.status === "ready" ? current.tryOn : null;
  const bookingContext = current?.status === "ready" ? (current.booking ?? null) : null;
  const name = design?.name || t("studio.workspace.untitled");
  useDocumentTitle(design ? `${name} · ${t("studio.workspace.share.view.documentTitle")}` : t("studio.workspace.share.view.documentTitle"));

  return (
    <div className="gt-editor flex min-h-[100dvh] flex-col bg-[var(--surface-page)] lg:h-[100dvh] lg:min-h-0">
      {!current ? (
        <div role="status" className="grid flex-1 place-items-center p-6 text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-2 text-[length:var(--text-body-sm)] font-semibold">
            <LoaderCircle size={16} aria-hidden="true" className="motion-safe:animate-spin" />
            {t("studio.workspace.share.view.opening")}
          </span>
        </div>
      ) : design ? (
        <SharedDesignView design={design} name={name} author={author} tryOn={tryOn} itemId={handle && item ? item : null} booking={bookingContext} />
      ) : booking && !signedIn ? (
        <div className="grid flex-1 place-items-center p-6">
          <div className="w-full max-w-[440px]">
            <SignInPrompt
              returnTo={`/studio-3d/rendez-vous/${booking}`}
              title={t("studio.workspace.share.view.bookingSignInTitle")}
              body={t("studio.workspace.share.view.bookingSignInBody")}
            />
          </div>
        </div>
      ) : (
        <InvalidLink
          stored={stored}
          glowbook={!!(handle && item)}
          booking={!!booking}
          unavailable={current.status === "unavailable"}
          onRetry={() => setRetry((n) => n + 1)}
        />
      )}
    </div>
  );
}

function InvalidLink({
  stored,
  glowbook,
  booking = false,
  unavailable,
  onRetry,
}: {
  stored: boolean;
  glowbook: boolean;
  booking?: boolean;
  unavailable: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const copy = unavailable ? "unavailable" : booking ? "bookingGone" : glowbook ? "glowbookGone" : stored ? "invalidStored" : "invalid";
  return (
    <div className="grid flex-1 place-items-center p-6">
      <div role="alert" className="grid max-w-[440px] justify-items-center gap-3 text-center">
        <Link2 size={28} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
        <h1 className="m-0 text-[length:var(--text-h3)] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
          {t(`studio.workspace.share.view.${copy}Title`)}
        </h1>
        <p className="m-0 text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-muted)]">{t(`studio.workspace.share.view.${copy}Body`)}</p>
        {unavailable ? (
          <Button variant="dark" size="sm" iconLeft={RotateCcw} className="mt-2" onClick={onRetry}>
            {t("studio.workspace.share.view.retry")}
          </Button>
        ) : (
          <Button as="a" href={STUDIO_PATH} variant="dark" size="sm" iconLeft={Box} className="mt-2">
            {t("studio.workspace.share.view.discover")}
          </Button>
        )}
      </div>
    </div>
  );
}

function SharedDesignView({
  design,
  name,
  author,
  tryOn,
  itemId,
  booking = null,
}: {
  design: SharedDesign;
  name: string;
  author: GlowbookAuthor | null;
  tryOn: TryOn;
  /** The Glowbook creation shown, when it comes from a Glowbook (decision 144: "Book this design"). */
  itemId: string | null;
  /** A client's creation joined to a booking (decision 148). */
  booking?: BookingContext | null;
}) {
  const { t, i18n } = useTranslation();
  const { signedIn, restoring } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [tryingOn, setTryingOn] = useState(false);
  // Read again each time the try-on dialog closes, so the count follows the renders just made.
  const tryOnStatus = useTryOnStatus(!!tryOn && !tryingOn);

  /** The recipient's own stage has work that opening a copy would replace. */
  const stageHasWork = () =>
    studioStore.jewels.length > 0 && (!studioStore.active || piecesKey(studioStore.jewels) !== studioStore.active.baselineKey);

  const openCopy = () => {
    // A new, unsaved design on their own stage: saving it makes it theirs.
    studioStore.loadScene(design.scene, null);
    studioStore.saveNow();
    showToast(t("studio.workspace.share.view.copyOpened", { name }), t("studio.workspace.share.view.copyOpenedBody"), "info");
    navigate(STUDIO_EDITOR_PATH);
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
      <SharedStage design={design} />
      <aside className="gt-editor-scroll grid content-start gap-5 overflow-y-auto border-t border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 lg:border-l lg:border-t-0 lg:p-6">
        <div className="grid gap-2">
          {/* The site's header is above: the viewer says "read only" here, quietly, instead of a second bar. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-[10.5px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-600)]">
              {author
                ? t("studio.workspace.share.view.glowbookEyebrow", { name: author.displayName || `@${author.handle}` })
                : booking
                  ? t("studio.workspace.share.view.bookingEyebrow")
                  : t("studio.workspace.share.view.eyebrow")}
            </p>
            <span className="inline-flex flex-none items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-blue-100)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-700)]">
              <Eye size={11} aria-hidden="true" />
              {t("studio.workspace.share.view.readOnly")}
            </span>
          </div>
          <h1 className="m-0 text-[length:var(--text-h3)] font-[var(--weight-black)] leading-tight tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {name}
          </h1>
          <p className="m-0 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text-muted)]">
            <Gem size={13} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
            {t("studio.workspace.gems", { count: design.scene.pieces.length })}
          </p>
          {design.description && (
            <p className="m-0 whitespace-pre-line text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-primary)]">{design.description}</p>
          )}
          <p className="m-0 text-[12px] leading-relaxed text-[var(--text-subtle)]">
            {t(
              author
                ? "studio.workspace.share.view.glowbookNote"
                : booking
                  ? `studio.workspace.share.view.${booking.viewer === "artist" ? "bookingNoteArtist" : "bookingNoteClient"}`
                  : "studio.workspace.share.view.readOnlyNote",
            )}
          </p>
          {booking?.startsAt && booking.otherName && (
            <p className="m-0 text-[12.5px] font-semibold text-[var(--text-primary)]">
              {t(`studio.workspace.share.view.${booking.viewer === "artist" ? "bookingWithClient" : "bookingWithArtist"}`, {
                when: formatWhen(booking.startsAt, booking.timezone ?? "Europe/Paris", isLocale(i18n.language) ? i18n.language : "fr"),
                name: booking.otherName,
              })}
            </p>
          )}
        </div>

        {booking && (
          <Link
            to={booking.viewer === "artist" ? AGENDA_PATH : "/compte/rendez-vous"}
            className="inline-flex items-center gap-2 justify-self-start rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-page)] py-1.5 pl-2 pr-3.5 text-[12.5px] font-semibold text-[var(--text-primary)] hover:border-[var(--gt-blue-400)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            {t(`studio.workspace.share.view.${booking.viewer === "artist" ? "backToAgenda" : "backToBookings"}`)}
          </Link>
        )}

        {author && (
          <Link
            to={localizedPath("glowbook", isLocale(i18n.language) ? i18n.language : "fr", { id: author.handle })}
            className="inline-flex items-center gap-2 justify-self-start rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-page)] py-1.5 pl-2 pr-3.5 text-[12.5px] font-semibold text-[var(--text-primary)] hover:border-[var(--gt-blue-400)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <Sparkles size={13} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
            {t("studio.workspace.share.view.backToGlowbook", { name: author.displayName || `@${author.handle}` })}
          </Link>
        )}

        {author && itemId && (
          <BookThisDesign handle={author.handle} itemId={itemId} designName={name} artistName={author.displayName || `@${author.handle}`} />
        )}

        {tryOn && design.scene.pieces.length > 0 && (
          <section
            aria-labelledby="gt-shared-try-on"
            className="grid justify-items-start gap-2.5 rounded-[var(--radius-lg)] border border-[var(--gt-blue-300)] bg-[var(--surface-brand-wash)] p-4"
          >
            <h2
              id="gt-shared-try-on"
              className="m-0 inline-flex items-center gap-2 text-[15px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]"
            >
              <ScanFace size={16} aria-hidden="true" className="text-[var(--gt-blue-700)]" />
              {t("studio.tryOn.visitor.title")}
            </h2>
            <p className="m-0 text-[12.5px] leading-relaxed text-[var(--text-muted)]">{t("studio.tryOn.visitor.body")}</p>
            <Button variant="primary" size="sm" iconLeft={ScanFace} disabled={tryOnExhausted(tryOnStatus, signedIn)} onClick={() => setTryingOn(true)}>
              {t("studio.tryOn.visitor.cta")}
            </Button>
            <TryOnAllowance status={tryOnStatus} />
          </section>
        )}

        <section
          aria-labelledby="gt-shared-shopping"
          className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4"
        >
          <div className="grid gap-1">
            <h2
              id="gt-shared-shopping"
              className="m-0 inline-flex items-center gap-2 text-[15px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]"
            >
              <ShoppingBag size={16} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
              {t("studio.workspace.share.view.shoppingTitle")}
            </h2>
            <p className="m-0 text-[12px] leading-relaxed text-[var(--text-muted)]">{t("studio.workspace.share.view.shoppingBody")}</p>
          </div>
          <FoldedShoppingList jewels={design.scene.pieces} />
        </section>

        {/* Copying into one's own Studio is for designs sent to the visitor (the booked artist
            included, to work from the client's design), not an artist's published work nor the
            client's own creation. */}
        {!author && booking?.viewer !== "client" && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-4">
            {restoring ? (
              <p role="status" className="m-0 flex items-center justify-center gap-2 py-8 text-[12.5px] text-[var(--text-muted)]">
                <LoaderCircle size={15} aria-hidden="true" className="motion-safe:animate-spin" />
                {t("studio.workspace.share.view.checkingAccount")}
              </p>
            ) : signedIn ? (
              <div className="grid justify-items-start gap-3 py-5">
                <h2 className="m-0 text-[17px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
                  {t("studio.workspace.share.view.copyTitle")}
                </h2>
                <p className="m-0 text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-muted)]">{t("studio.workspace.share.view.copyBody")}</p>
                <Button variant="primary" size="sm" iconLeft={PencilRuler} onClick={() => (stageHasWork() ? setConfirmReplace(true) : openCopy())}>
                  {t("studio.workspace.share.view.copyCta")}
                </Button>
              </div>
            ) : (
              <SignInPrompt
                compact
                returnTo={`${pathname}${hash}`}
                title={t("studio.workspace.share.view.signInTitle")}
                body={t("studio.workspace.share.view.signInBody")}
              />
            )}
          </div>
        )}

        <Link
          to={STUDIO_PATH}
          className="inline-flex items-center gap-1.5 justify-self-start rounded-[var(--radius-xs)] text-[12.5px] font-semibold text-[var(--gt-blue-700)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <Box size={13} aria-hidden="true" />
          {t("studio.workspace.share.view.discover")}
        </Link>
      </aside>

      {tryingOn && tryOn && (
        <Suspense fallback={null}>
          <TryOnDialog creation={{ name, scene: design.scene }} source={tryOn} audience="visitor" onClose={() => setTryingOn(false)} />
        </Suspense>
      )}

      {confirmReplace && (
        <Dialog
          open
          onClose={() => setConfirmReplace(false)}
          title={t("studio.workspace.discard.title")}
          description={t("studio.workspace.share.view.replaceBody")}
          icon={<TriangleAlert size={17} />}
          closeLabel={t("studio.workspace.close")}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setConfirmReplace(false)}>
                {t("studio.workspace.cancel")}
              </Button>
              <Button
                variant="dark"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setConfirmReplace(false);
                  openCopy();
                }}
              >
                {t("studio.workspace.share.view.replaceConfirm")}
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}

/* Glass on the stage, as the editor draws its floating controls. */
const stageGlass = "border border-white/15 bg-[rgba(22,26,32,.62)] text-white backdrop-blur-md";
const stageButton = clsx(
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] font-semibold transition-colors",
  "hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white",
);

/** The 3D stage of the shared design: its own store, never persisted, and a read-only engine. */
function SharedStage({ design }: { design: SharedDesign }) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StudioEngine | null>(null);
  const store = useMemo(() => new DesignStore({ persist: false }), []);
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [failed, setFailed] = useState(false);
  const [orbit, setOrbit] = useState(false);
  const { ref: stageRef, active: fullscreen, overlay: fullscreenOverlay, toggle: toggleFullscreen } = useStageFullscreen<HTMLElement>();

  useEffect(() => {
    store.loadScene(design.scene, null);
  }, [store, design]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: StudioEngine;
    try {
      engine = new StudioEngine(host, store, { readOnly: true });
    } catch {
      setFailed(true); // no WebGL
      return;
    }
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, [store]);

  return (
    <section
      ref={stageRef}
      aria-label={t("studio.workspace.share.view.stageLabel")}
      className={clsx(
        "gt-editor-stage relative isolate h-[60vh] min-h-[360px] min-w-0 overflow-hidden lg:h-auto lg:min-h-0",
        fullscreenOverlay && "!fixed inset-0 z-[90] !h-[100dvh] !min-h-0",
      )}
    >
      <div ref={hostRef} className="gt-editor-canvas absolute inset-0" />
      {failed && (
        <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center">
          <div className="grid max-w-[380px] justify-items-center gap-3 text-[var(--gt-ink-900)]">
            <TriangleAlert size={28} aria-hidden="true" className="text-[var(--gt-red-500)]" />
            <p className="m-0 text-[length:var(--text-body-md)] font-bold">{t("studio.editor.webgl.title")}</p>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--gt-ink-700)]">{t("studio.editor.webgl.body")}</p>
          </div>
        </div>
      )}
      {snap.modelLoading && !failed && (
        <div
          role="status"
          className={clsx(
            "absolute left-1/2 top-1/2 z-[6] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full py-2 pl-3 pr-4 text-[12px] font-semibold",
            stageGlass,
          )}
        >
          <LoaderCircle size={16} aria-hidden="true" className="motion-safe:animate-spin" />
          {t("studio.editor.viewport.loading")}
        </div>
      )}
      {!failed && (
        <div className={clsx("absolute bottom-4 left-1/2 z-[6] flex -translate-x-1/2 items-center gap-0.5 rounded-full p-1", stageGlass)}>
          <button
            type="button"
            className={stageButton}
            aria-label={t("studio.editor.views.reset")}
            title={t("studio.editor.views.reset")}
            onClick={() => {
              setOrbit(false);
              engineRef.current?.setAutoRotate(false);
              engineRef.current?.setView("reset");
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
          </button>
          <span aria-hidden="true" className="mx-0.5 h-4 w-px flex-none bg-white/20" />
          <button
            type="button"
            className={stageButton}
            aria-label={t("studio.editor.zoomOut")}
            title={t("studio.editor.zoomOut")}
            onClick={() => engineRef.current?.zoomBy(1.25)}
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={stageButton}
            aria-label={t("studio.editor.zoomIn")}
            title={t("studio.editor.zoomIn")}
            onClick={() => engineRef.current?.zoomBy(0.8)}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
          <span aria-hidden="true" className="mx-0.5 h-4 w-px flex-none bg-white/20" />
          <button
            type="button"
            aria-pressed={orbit}
            aria-label={t("studio.editor.orbit")}
            title={t("studio.editor.orbitHint")}
            onClick={() => {
              engineRef.current?.setAutoRotate(!orbit);
              setOrbit(!orbit);
            }}
            className={clsx(stageButton, orbit && "bg-white text-[var(--gt-ink-900)] hover:bg-white")}
          >
            <Orbit size={14} aria-hidden="true" />
            <span aria-hidden="true" className="max-sm:hidden">
              {t("studio.editor.orbit")}
            </span>
          </button>
          <span aria-hidden="true" className="mx-0.5 h-4 w-px flex-none bg-white/20" />
          <StageFullscreenButton active={fullscreen} onToggle={toggleFullscreen} className={stageButton} />
        </div>
      )}
    </section>
  );
}
