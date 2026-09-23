import type { CalloutTone, IconKey } from "../../data/legal/types";
import {
  Building2,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Download,
  Eye,
  Hand,
  Home,
  ListChecks,
  Mail,
  MapPin,
  Package,
  PauseCircle,
  Pencil,
  Scale,
  Search,
  Settings2,
  ShoppingBag,
  Trash2,
  Truck,
  Undo2,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export const ICONS: Record<IconKey, LucideIcon> = {
  eye: Eye,
  pencil: Pencil,
  trash: Trash2,
  pause: PauseCircle,
  hand: Hand,
  download: Download,
  undo: Undo2,
  scale: Scale,
  cart: ShoppingBag,
  cog: Settings2,
  truck: Truck,
  package: Package,
  map: MapPin,
  home: Home,
  mail: Mail,
  search: Search,
  wallet: Wallet,
  check: CheckCircle2,
  clipboard: ClipboardList,
};

/**
 * The four kinds of statement a legal page makes, each with its own icon and
 * label so the difference never rests on colour. Shared with `ContentKey`,
 * which explains them at the top of the page.
 */
export const TONES: Record<CalloutTone, { icon: LucideIcon; box: string; fg: string }> = {
  legal: {
    icon: Scale,
    box: "border-[var(--gt-blue-200)] bg-[var(--status-info-bg)] before:bg-[var(--gt-blue-500)]",
    fg: "text-[var(--gt-blue-700)]",
  },
  policy: {
    icon: Building2,
    box: "border-[var(--border-subtle)] bg-[var(--surface-card)] before:bg-[var(--gt-ink-900)]",
    fg: "text-[var(--text-primary)]",
  },
  instruction: {
    icon: ListChecks,
    box: "border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] before:bg-[var(--gt-emerald-500)]",
    fg: "text-[var(--status-success-fg)]",
  },
  verify: {
    icon: CircleDashed,
    box: "border-dashed border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] before:bg-[var(--gt-amber-400)]",
    fg: "text-[var(--gt-amber-700)]",
  },
};
