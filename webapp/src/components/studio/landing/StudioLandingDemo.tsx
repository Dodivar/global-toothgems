"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { Button } from "../../ui/Button";
import { SmileCanvas } from "../SmileCanvas";
import { STOPS } from "../gemStyle";
import { COMPOSITIONS, type StudioMaterial } from "../../../data/studio";
import { trackStudioOnce } from "../../../lib/studioAnalytics";

/**
 * The landing page's taste of the Studio, open to anyone without an account:
 * the drawing of a smile with one of the Studio's inspiration compositions
 * (`data/studio.ts`), whose gems can all be recoloured. It is an illustration
 * and says so — the working editor is the 3D one behind the trial. Nothing is
 * stored or sent but one analytics fact (first use, with consent).
 */

const LOOKS = ["signature", "minimal", "statement", "symmetrical", "mixed", "sparkle"] as const;
const MATERIALS = Object.keys(STOPS) as StudioMaterial[];

export function StudioLandingDemo({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation();
  const [look, setLook] = useState<(typeof LOOKS)[number]>("signature");
  const [material, setMaterial] = useState<StudioMaterial | null>(null);

  const pieces = useMemo(() => COMPOSITIONS[look].map((piece) => (material ? { ...piece, material } : piece)), [look, material]);
  const used = (kind: "look" | "colour") => trackStudioOnce("landing_demo", "studio_landing_demo_used", { interaction: kind });
  const lookName = t(`studioLanding.demo.looksNames.${look}`);

  return (
    <div className="gt-studio-b-card grid gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-3 sm:p-5">
      <div className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--gt-ink-900)]">
        <SmileCanvas pieces={pieces} label={t("studioLanding.demo.canvas", { name: lookName })} className="block aspect-[16/10] w-full" />
      </div>

      <div role="group" aria-label={t("studioLanding.demo.looks")} className="flex flex-wrap gap-2">
        {LOOKS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={look === id}
            onClick={() => {
              setLook(id);
              used("look");
            }}
            className={clsx(
              "min-h-11 rounded-[var(--radius-pill)] border px-4 text-[length:var(--text-body-sm)] font-semibold transition-colors",
              look === id
                ? "border-[var(--gt-blue-700)] bg-[var(--gt-blue-700)] text-white"
                : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:border-[var(--gt-blue-300)]",
            )}
          >
            {t(`studioLanding.demo.looksNames.${id}`)}
          </button>
        ))}
      </div>

      <div role="group" aria-label={t("studioLanding.demo.colour")} className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={material === null}
          onClick={() => {
            setMaterial(null);
            used("colour");
          }}
          className={clsx(
            "min-h-11 rounded-[var(--radius-pill)] border px-3.5 text-[length:var(--text-caption)] font-semibold",
            material === null ? "border-[var(--gt-blue-700)] bg-[var(--gt-blue-50)] text-[var(--gt-blue-700)]" : "border-[var(--border-subtle)] text-[var(--text-body)] hover:border-[var(--gt-blue-300)]",
          )}
        >
          {t("studioLanding.demo.colourOriginal")}
        </button>
        {MATERIALS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={material === id}
            aria-label={t(`studioLanding.demo.materials.${id}`)}
            title={t(`studioLanding.demo.materials.${id}`)}
            onClick={() => {
              setMaterial(id);
              used("colour");
            }}
            className={clsx(
              "grid h-11 w-11 place-items-center rounded-full border-2 transition-transform hover:scale-105",
              material === id ? "border-[var(--gt-blue-700)]" : "border-transparent",
            )}
          >
            <span
              aria-hidden="true"
              className="h-7 w-7 rounded-full border border-black/10"
              style={{ background: `radial-gradient(circle at 35% 30%, ${STOPS[id][0]}, ${STOPS[id][1]} 55%, ${STOPS[id][2]})` }}
            />
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("studioLanding.demo.note")}</p>
        <Button variant="primary" iconRight={ArrowRight} onClick={onContinue} className="gt-studio-cta">
          {t("studioLanding.demo.cta")}
        </Button>
      </div>
    </div>
  );
}
