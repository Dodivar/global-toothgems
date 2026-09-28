import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Box, Eye, Gem, Link2, LoaderCircle, Minus, Orbit, PencilRuler, Plus, RotateCcw, TriangleAlert } from "lucide-react";
import monogram from "../assets/monogram-blue.png";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { useDocumentTitle } from "../components/legal/hooks";
import { SignInPrompt } from "../components/studio/workspace/SignInPrompt";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { StudioEngine } from "../lib/studio3d/engine";
import { DesignStore, studioStore } from "../lib/studio3d/store";
import { STUDIO_EDITOR_PATH, STUDIO_PATH } from "../lib/studioUrl";
import { piecesKey } from "../lib/studioWorkspace/scene";
import { decodeSharedDesign, type SharedDesign } from "../lib/studioWorkspace/share";

/**
 * A Studio design someone shared (`/studio-3d/partage#…`), shown read-only.
 *
 * The recipient can turn, zoom and light-orbit the composition, nothing more:
 * the engine runs in read-only mode on a store of its own that is never
 * persisted, so opening a link can neither change the shared design nor
 * touch the recipient's own draft. Signed out, the page invites them to sign
 * in to use the Studio; signed in, they can take a copy into their editor.
 *
 * Open to everyone and outside `RequireStudioAccess`: looking at a design
 * someone sent you is not using the paid tool. Lazy-loaded with three.js.
 */
export function StudioShare() {
  const { t } = useTranslation();
  const { hash } = useLocation();
  // `undefined` while decoding, `null` for a link that carries no valid design.
  const [decoded, setDecoded] = useState<{ hash: string; design: SharedDesign | null } | null>(null);

  useEffect(() => {
    let live = true;
    decodeSharedDesign(hash)
      .then((design) => live && setDecoded({ hash, design }))
      .catch(() => live && setDecoded({ hash, design: null }));
    return () => {
      live = false;
    };
  }, [hash]);

  const current = decoded && decoded.hash === hash ? decoded : null;
  const design = current?.design ?? null;
  const name = design?.name || t("studio.workspace.untitled");
  useDocumentTitle(design ? `${name} · ${t("studio.workspace.share.view.documentTitle")}` : t("studio.workspace.share.view.documentTitle"));

  return (
    <div className="gt-editor flex min-h-[100dvh] flex-col bg-[var(--surface-page)] lg:h-[100dvh] lg:min-h-0">
      <header className="flex h-14 flex-none items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 sm:px-4">
        <Link
          to={STUDIO_PATH}
          className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-sm)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <img src={monogram} alt="" aria-hidden="true" className="h-7 w-7 flex-none object-contain" />
          <span className="text-[15px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {t("studio.editor.appName")}
          </span>
        </Link>
        {design && (
          <p className="m-0 min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-muted)]">
            <span aria-hidden="true">/ </span>
            {name}
          </p>
        )}
        <span className="ml-auto inline-flex flex-none items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--gt-blue-100)] px-3 py-1 text-[11px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-700)]">
          <Eye size={13} aria-hidden="true" />
          {t("studio.workspace.share.view.readOnly")}
        </span>
      </header>

      {!current ? (
        <div role="status" className="grid flex-1 place-items-center p-6 text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-2 text-[length:var(--text-body-sm)] font-semibold">
            <LoaderCircle size={16} aria-hidden="true" className="motion-safe:animate-spin" />
            {t("studio.workspace.share.view.opening")}
          </span>
        </div>
      ) : design ? (
        <SharedDesignView design={design} name={name} />
      ) : (
        <InvalidLink />
      )}
    </div>
  );
}

function InvalidLink() {
  const { t } = useTranslation();
  return (
    <div className="grid flex-1 place-items-center p-6">
      <div role="alert" className="grid max-w-[440px] justify-items-center gap-3 text-center">
        <Link2 size={28} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
        <h1 className="m-0 text-[length:var(--text-h3)] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
          {t("studio.workspace.share.view.invalidTitle")}
        </h1>
        <p className="m-0 text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-muted)]">{t("studio.workspace.share.view.invalidBody")}</p>
        <Button as="a" href={STUDIO_PATH} variant="dark" size="sm" iconLeft={Box} className="mt-2">
          {t("studio.workspace.share.view.discover")}
        </Button>
      </div>
    </div>
  );
}

function SharedDesignView({ design, name }: { design: SharedDesign; name: string }) {
  const { t } = useTranslation();
  const { signedIn, restoring } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const [confirmReplace, setConfirmReplace] = useState(false);

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
          <p className="m-0 text-[10.5px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-600)]">
            {t("studio.workspace.share.view.eyebrow")}
          </p>
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
          <p className="m-0 text-[12px] leading-relaxed text-[var(--text-subtle)]">{t("studio.workspace.share.view.readOnlyNote")}</p>
        </div>

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

        <Link
          to={STUDIO_PATH}
          className="inline-flex items-center gap-1.5 justify-self-start rounded-[var(--radius-xs)] text-[12.5px] font-semibold text-[var(--gt-blue-700)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <Box size={13} aria-hidden="true" />
          {t("studio.workspace.share.view.discover")}
        </Link>
      </aside>

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
      aria-label={t("studio.workspace.share.view.stageLabel")}
      className="gt-editor-stage relative isolate h-[60vh] min-h-[360px] min-w-0 overflow-hidden lg:h-auto lg:min-h-0"
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
        </div>
      )}
    </section>
  );
}
