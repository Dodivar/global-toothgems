import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../lib/auth";
import { isSupabaseConfigured } from "../../../lib/supabase/client";
import { rightsFor, type BrandingRights, type ShareBranding } from "../../../lib/studio3d/socialExport/branding";
import { decodeLogo } from "../../../lib/studio3d/socialExport/exporter";
import type { MarkImage } from "../../../lib/studio3d/socialExport/compose";
import { prepareLogo } from "../../../lib/studio3d/socialExport/logoFile";
import {
  downloadShareLogo,
  loadShareBranding,
  removeShareLogo,
  saveShareLogo,
  ShareBrandingError,
} from "../../../lib/studioWorkspace/shareBrandingRepository";

export type LogoErrorKey = "type" | "size" | "decode" | "forbidden" | "unavailable" | "load";

export interface ShareBrandingState {
  /** Still asking the database. */
  loading: boolean;
  /** The plan could not be read: essential rights apply (the safe side). */
  unavailable: boolean;
  rights: BrandingRights;
  branding: ShareBranding | null;
  /** The member's logo, decoded for drawing, when the plan allows it. */
  logo: MarkImage | null;
  /** Object URL of the logo, for its thumbnail. */
  logoUrl: string | null;
  savingLogo: boolean;
  logoError: LogoErrorKey | null;
  uploadLogo: (file: File) => Promise<void>;
  deleteLogo: () => Promise<void>;
}

/**
 * The member's export branding: their tier from the database and their logo.
 * Without a Supabase project (the preview), or while the answer is missing,
 * the rights are the Essential ones — the watermark stays.
 */
export function useShareBranding(): ShareBrandingState {
  const { userId, realAuth } = useAuth();
  const live = isSupabaseConfigured && realAuth && !!userId;
  const [loading, setLoading] = useState(live);
  const [unavailable, setUnavailable] = useState(false);
  const [branding, setBranding] = useState<ShareBranding | null>(null);
  const [logo, setLogo] = useState<{ image: MarkImage; url: string } | null>(null);
  const [savingLogo, setSavingLogo] = useState(false);
  const [logoError, setLogoError] = useState<LogoErrorKey | null>(null);
  const urlRef = useRef<string | null>(null);
  const setLogoUrl = useCallback((url: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
  }, []);

  const showLogo = useCallback(async (blob: Blob) => {
    const image = await decodeLogo(blob);
    if (!image) return false;
    const url = URL.createObjectURL(blob);
    setLogoUrl(url);
    setLogo({ image, url });
    return true;
  }, [setLogoUrl]);

  useEffect(() => {
    if (!live) return;
    let active = true;
    loadShareBranding()
      .then(async (b) => {
        if (!active) return;
        setBranding(b);
        if (b.logoPath) {
          try {
            const blob = await downloadShareLogo(b.logoPath);
            if (active && !(await showLogo(blob))) setLogoError("load");
          } catch {
            if (active) setLogoError("load");
          }
        }
      })
      .catch(() => active && setUnavailable(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [live, showLogo]);

  // Free the thumbnail's object URL with the dialog.
  useEffect(() => () => setLogoUrl(null), [setLogoUrl]);

  const rights = rightsFor(unavailable ? null : (branding?.tier ?? null));

  const uploadLogo = useCallback(
    async (file: File) => {
      if (!userId) return;
      setLogoError(null);
      const prepared = await prepareLogo(file);
      if (!prepared.ok) return setLogoError(prepared.problem);
      setSavingLogo(true);
      try {
        const path = await saveShareLogo(userId, prepared.png);
        setBranding((b) => ({ tier: b?.tier ?? null, logoPath: path, hasLogo: true }));
        await showLogo(prepared.png);
      } catch (err) {
        setLogoError(err instanceof ShareBrandingError && err.kind === "forbidden" ? "forbidden" : "unavailable");
      } finally {
        setSavingLogo(false);
      }
    },
    [userId, showLogo],
  );

  const deleteLogo = useCallback(async () => {
    setLogoError(null);
    setSavingLogo(true);
    try {
      await removeShareLogo();
      setBranding((b) => (b ? { ...b, logoPath: null, hasLogo: false } : b));
      setLogoUrl(null);
      setLogo(null);
    } catch {
      setLogoError("unavailable");
    } finally {
      setSavingLogo(false);
    }
  }, [setLogoUrl]);

  return {
    loading: live && loading,
    unavailable,
    rights,
    branding,
    logo: rights.mayUseLogo ? (logo?.image ?? null) : null,
    logoUrl: logo?.url ?? null,
    savingLogo,
    logoError,
    uploadLogo,
    deleteLogo,
  };
}
