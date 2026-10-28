import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  Braces,
  ChevronDown,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  ReceiptText,
  Save,
  ScanFace,
  Settings2,
  Share,
  Share2,
  SquareDashed,
} from "lucide-react";
import { Button } from "../../ui/Button";
import { EditorPopover, PopoverItem, PopoverLabel, PopoverSeparator } from "./EditorPopover";
import { useEditorLabels } from "./editorLabels";
import { PlacementSheetMenuItem } from "./PlacementSheetMenuItem";
import { ShareNetworkIcon } from "../ShareNetworks";
import { useWorkspaceActions } from "../workspace/useWorkspaceActions";
import { FREE_TOOTH } from "../../../data/studioEditor";
import { estimateComposition } from "../../../lib/studio3d/gemCatalog";
import { sameSize, sortSizes } from "../../../lib/gemOptions";
import { useStudioGems } from "../../../lib/studio3d/useStudioGems";
import { downloadURL, getEngine } from "../../../lib/studio3d/engine";
import { notify } from "../../../lib/studio3d/notices";
import { buildQuoteSheetDataURL } from "../../../lib/studio3d/quoteSheet";
import { canShareFiles, openShareLink, SHARE_NETWORKS, type ShareContent, type ShareNetwork } from "../../../lib/studio3d/socialShare";
import { CLIENT_NAME_MAX, studioStore, useStudio } from "../../../lib/studio3d/store";
import { useStudioFeature, useStudioStaff } from "../../../lib/studioAccess";
import { lowestPlanWith, type LockedFeature } from "../../../lib/studioEntitlements";
import type { ShareLink } from "../../../lib/studioWorkspace/share";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { useFormat } from "../../../lib/format";

const inputClass =
  "h-9 min-w-0 flex-1 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)]";

/**
 * The editor's one Share menu (owner's request 2026-10-28: Export and Share
 * were two menus that overlapped). In order:
 *
 * - Share: the render through the system share sheet where the browser offers
 *   one (the only way into Instagram or TikTok from the web), then the social
 *   networks with the creation's READ-ONLY LINK — whoever opens it sees the
 *   design in 3D and cannot change it.
 * - Images: the PNG on the Studio backdrop with the Global Toothgems logo,
 *   and without a background from the Artist plan up.
 * - Prepare the appointment: the estimate sheet, the placement sheet and the
 *   AI smile try-on (Atelier).
 * - Team only: the raw JSON.
 *
 * A feature below the member's plan stays listed, locked, "With the … plan",
 * and opens the plan panel. Opening the menu never makes a design public: it
 * only looks for a link the artist already created; creating one is the share
 * dialog's explicit step, and a design must be saved first.
 */
export function ShareExportMenu() {
  const { formatDate } = useFormat();
  const labels = useEditorLabels();
  const { t } = labels;
  const { byKey } = useStudioGems();
  const ws = useWorkspace();
  const snap = useStudio();
  const { save } = useWorkspaceActions();
  const [open, setOpen] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [client, setClient] = useState(studioStore.clientName);
  // Rendered as the menu opens: the share sheet must be called right in the click, with no wait before it.
  const [image, setImage] = useState<File | null>(null);
  // `undefined` while looking, `null` when the creation has no active link yet.
  const [link, setLink] = useState<ShareLink | null | undefined>(undefined);
  const linked = ws.creations.find((c) => c.id === snap.active?.creationId) ?? null;
  const { existingShareLink } = ws;
  // Try-on works from the saved creation: offered once the design is saved with nothing pending.
  const saved = !ws.dirty && linked && linked.elementCount > 0 ? linked : null;
  const transparentAllowed = useStudioFeature("transparentExport");
  const tryOnAllowed = useStudioFeature("tryOn");
  // The raw JSON is a team tool, not a member export.
  const staff = useStudioStaff();

  useEffect(() => {
    if (!open || !studioStore.jewels.length) return;
    let live = true;
    getEngine()
      ?.shareableImage()
      .then((file) => live && setImage(file))
      .catch(() => live && setImage(null));
    return () => {
      live = false;
      setImage(null);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !linked) return;
    let live = true;
    existingShareLink(linked).then((l) => live && setLink(l));
    return () => {
      live = false;
      setLink(undefined);
    };
  }, [open, linked, existingShareLink]);

  const close = () => {
    setOpen(false);
    setQuoting(false);
  };
  const withPlan = (feature: LockedFeature) =>
    t("studio.access.planLocked.withPlan", { plan: t(`studio.plans.items.${lowestPlanWith(feature)}.name`) });
  const showLocked = (feature: LockedFeature) => {
    close();
    openWorkspaceDialog({ kind: "planLocked", feature });
  };

  const content = (url: string): ShareContent => ({
    url,
    text: t("studio.workspace.share.nativeText", { name: linked?.name ?? "" }),
    title: linked?.name ?? t("studio.editor.share.title"),
  });

  const shareImage = (file: File) => {
    const text = linked && link ? `${content(link.url).text} ${link.url}` : t("studio.editor.share.message");
    close();
    navigator.share({ files: [file], title: linked?.name ?? t("studio.editor.share.title"), text }).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return; // closed by the customer
      notify("shareFailed", undefined, "error");
    });
  };

  const copyLink = async (url: string) => {
    close();
    try {
      await navigator.clipboard.writeText(url);
      notify("linkCopied");
    } catch {
      notify("linkCopyFailed", undefined, "error");
    }
  };

  const shareTo = async (network: ShareNetwork, url: string) => {
    close();
    const copied = await openShareLink(network, content(url));
    if (copied === true) notify("linkCopiedPaste", { network: t(`studio.editor.share.${network}`) });
    else if (copied === false) notify("linkCopyFailed", undefined, "error");
  };

  const openShareDialog = () => {
    close();
    if (linked) openWorkspaceDialog({ kind: "shareCreation", creation: linked });
  };

  const exportPng = async (transparent: boolean) => {
    const engine = getEngine();
    close();
    if (!engine || (transparent && transparentAllowed !== true)) return;
    try {
      await engine.exportPNG(transparent);
      notify(transparent ? "exportedTransparent" : "exportedPng");
    } catch {
      notify("exportFailed", undefined, "error");
    }
  };
  const exportJson = () => {
    getEngine()?.exportJSON();
    close();
    notify("exportedJson");
  };
  const doQuote = async () => {
    const engine = getEngine();
    if (!engine || !studioStore.jewels.length) return notify("quoteEmpty", undefined, "warning");
    studioStore.setClientName(client);
    close();
    notify("quoteBuilding", undefined, "info");
    try {
      const jewels = studioStore.jewels;
      // One row per shop item to buy: a product in one colour (and size), with the teeth and sizes it covers.
      const estimate = estimateComposition(jewels, (key) => byKey.get(key));
      const rows = estimate.lines.map((line) => {
        const pieces = jewels.filter(
          (j) => j.productId === line.productId && (j.variantId ?? null) === line.variantId && (line.size == null || sameSize(j.size, line.size)),
        );
        const teeth = [...new Set(pieces.map((j) => (j.toothId === FREE_TOOTH ? "—" : j.toothId)))];
        const sizes = sortSizes(pieces.map((j) => j.size));
        return {
          name: `${labels.pieceName(pieces[0])} ×${line.pieces}`,
          tooth: teeth.join(", "),
          size: sizes.map(labels.sizeShort).join(", "),
          finish: labels.finishName(pieces[0]) ?? "—",
          price: `${line.quantity} × ${labels.formatEstimate(line.unitMinor)}`,
        };
      });
      if (estimate.unavailable)
        rows.push({ name: t("studio.editor.pieceUnavailable"), tooth: "—", size: "—", finish: "—", price: `×${estimate.unavailable}` });
      const url = await buildQuoteSheetDataURL({
        renderURL: engine.captureView(),
        clientName: client,
        rows,
        total: labels.formatEstimate(estimate.totalMinor),
        labels: {
          title: t("studio.editor.quote.title"),
          date: formatDate(new Date().toISOString()),
          client: t("studio.editor.quote.client"),
          piece: t("studio.editor.quote.piece"),
          tooth: t("studio.editor.quote.tooth"),
          size: t("studio.editor.quote.size"),
          finish: t("studio.editor.quote.finish"),
          price: t("studio.editor.quote.price"),
          total: t("studio.editor.quote.total"),
          footer: t("studio.editor.quote.footer", { count: jewels.length }),
        },
      });
      downloadURL(url, `global-toothgems-studio-estimate-${new Date().toISOString().slice(0, 10)}.png`);
      notify("quoteExported");
    } catch {
      notify("quoteFailed", undefined, "error");
    }
  };

  return (
    <EditorPopover
      label={t("studio.editor.share.menu")}
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      width={300}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          title={t("studio.editor.share.menu")}
          className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] px-3 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] max-xl:w-9 max-xl:justify-center max-xl:px-0 xl:px-3.5"
        >
          <Share2 size={14} aria-hidden="true" />
          <span className="hidden xl:inline">{t("studio.editor.share.menu")}</span>
          <span className="sr-only xl:hidden">{t("studio.editor.share.menu")}</span>
          <ChevronDown size={13} aria-hidden="true" className="hidden xl:block" />
        </button>
      )}
    >
      {image && canShareFiles(image) && (
        <>
          <PopoverItem
            icon={<Share size={14} />}
            label={t("studio.editor.share.native")}
            sub={t("studio.editor.share.nativeSub")}
            onClick={() => shareImage(image)}
          />
          <PopoverSeparator />
        </>
      )}
      <PopoverLabel>{t("studio.editor.share.networks")}</PopoverLabel>
      {!linked ? (
        <PopoverItem
          icon={<Save size={14} />}
          label={t("studio.editor.share.saveFirst")}
          sub={t("studio.editor.share.saveFirstSub")}
          onClick={() => {
            close();
            save("auto");
          }}
        />
      ) : link === undefined ? (
        <p role="status" className="m-0 flex items-center gap-2 px-2.5 py-2 text-[12.5px] text-[var(--text-muted)]">
          <LoaderCircle size={14} aria-hidden="true" className="motion-safe:animate-spin" />
          {t("studio.editor.share.lookingUp")}
        </p>
      ) : link === null ? (
        <PopoverItem
          icon={<Link2 size={14} />}
          label={t("studio.editor.share.createLink")}
          sub={t("studio.editor.share.createLinkSub")}
          onClick={openShareDialog}
        />
      ) : (
        <>
          <ul className="m-0 grid list-none grid-cols-2 gap-0.5 p-0">
            {SHARE_NETWORKS.map((network) => (
              <li key={network} className="min-w-0">
                <button
                  type="button"
                  onClick={() => void shareTo(network, link.url)}
                  className={clsx(
                    "flex w-full min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-brand-wash)]",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                  )}
                >
                  <span aria-hidden="true" className="flex-none text-[var(--gt-blue-600)]">
                    <ShareNetworkIcon network={network} />
                  </span>
                  <span className="truncate">{t(`studio.editor.share.${network}`)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="m-0 px-2.5 pb-1 pt-0.5 text-[11.5px] leading-snug text-[var(--text-muted)]">{t("studio.editor.share.networksHint")}</p>
          <PopoverItem icon={<Link2 size={14} />} label={t("studio.editor.share.copyLink")} onClick={() => void copyLink(link.url)} />
          <PopoverItem icon={<Settings2 size={14} />} label={t("studio.editor.share.manageLink")} onClick={openShareDialog} />
        </>
      )}
      {linked && ws.dirty && <p className="m-0 px-2.5 pb-1 text-[11.5px] leading-snug text-[var(--text-muted)]">{t("studio.editor.share.unsavedHint")}</p>}

      <PopoverSeparator />
      <PopoverLabel>{t("studio.editor.export.images")}</PopoverLabel>
      <PopoverItem
        icon={<ImageIcon size={14} />}
        label={t("studio.editor.export.png")}
        sub={t("studio.editor.export.pngSub")}
        onClick={() => void exportPng(false)}
      />
      {transparentAllowed === false ? (
        <PopoverItem
          locked
          icon={<SquareDashed size={14} />}
          label={t("studio.editor.export.transparent")}
          sub={withPlan("transparentExport")}
          onClick={() => showLocked("transparentExport")}
        />
      ) : (
        transparentAllowed && (
          <PopoverItem
            icon={<SquareDashed size={14} />}
            label={t("studio.editor.export.transparent")}
            sub={t("studio.editor.export.transparentSub")}
            onClick={() => void exportPng(true)}
          />
        )
      )}

      <PopoverSeparator />
      <PopoverLabel>{t("studio.editor.export.prepareSection")}</PopoverLabel>
      {quoting ? (
        <form
          className="flex gap-1.5 p-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void doQuote();
          }}
        >
          <input
            autoFocus
            aria-label={t("studio.editor.export.clientLabel")}
            placeholder={t("studio.editor.export.clientPlaceholder")}
            value={client}
            maxLength={CLIENT_NAME_MAX}
            onChange={(e) => setClient(e.target.value)}
            className={inputClass}
          />
          <Button type="submit" variant="dark" size="sm">
            {t("studio.editor.export.quoteAction")}
          </Button>
        </form>
      ) : (
        <PopoverItem
          icon={<ReceiptText size={14} />}
          label={t("studio.editor.export.quote")}
          sub={t("studio.editor.export.quoteSub")}
          onClick={() => setQuoting(true)}
        />
      )}
      <PlacementSheetMenuItem onDone={close} />
      {tryOnAllowed === false ? (
        <PopoverItem locked icon={<ScanFace size={14} />} label={t("studio.tryOn.action")} sub={withPlan("tryOn")} onClick={() => showLocked("tryOn")} />
      ) : (
        tryOnAllowed &&
        saved && (
          <PopoverItem
            icon={<ScanFace size={14} />}
            label={t("studio.tryOn.action")}
            sub={t("studio.tryOn.editorSub")}
            onClick={() => {
              close();
              openWorkspaceDialog({ kind: "tryOn", creation: saved });
            }}
          />
        )
      )}

      {staff && (
        <>
          <PopoverSeparator />
          <PopoverItem icon={<Braces size={14} />} label={t("studio.editor.export.json")} sub={t("studio.editor.export.jsonSub")} onClick={exportJson} />
        </>
      )}
    </EditorPopover>
  );
}
