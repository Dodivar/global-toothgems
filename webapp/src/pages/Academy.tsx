import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "../components/ui/Button";
import { CourseCard } from "../components/ui/CourseCard";
import { COURSES } from "../data/courses";
import { pick } from "../data/types";
import { useToast } from "../lib/toast";
import { photo } from "../lib/images";

const STATS = [
  { valueKey: "1 840", labelKey: "academy.stat1Label" },
  { valueKey: "14", labelKey: "academy.stat2Label" },
  { valueKey: "39", labelKey: "academy.stat3Label" },
];

export function Academy() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const lang = i18n.language;

  const enroll = () => {
    navigate("/academy/lecon");
    showToast(t("academy.toastEnrollTitle"), t("academy.toastEnrollBody"));
  };
  const preview = () => {
    navigate("/academy/lecon");
    showToast(t("academy.toastPreviewTitle"), t("academy.toastPreviewBody"));
  };

  return (
    <div>
      <section className="bg-[var(--surface-inverse)] px-[clamp(14px,4vw,48px)] py-[clamp(56px,8vw,104px)] text-[var(--text-inverse)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-10">
          <div className="grid max-w-[720px] gap-5">
            <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
              {t("academy.eyebrow")}
            </span>
            <h1
              className="text-[length:var(--text-display-1)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-off-white)]"
              dangerouslySetInnerHTML={{ __html: t("academy.title") }}
            />
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-lg)] text-[var(--gt-ink-300)]">{t("academy.body")}</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" size="lg" onClick={enroll}>{t("academy.ctaEnroll")}</Button>
              <Button variant="glass" size="lg" iconLeft={Play} onClick={preview}>{t("academy.ctaPreview")}</Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 border-t border-white/15 pt-8">
            {STATS.map((s) => (
              <div key={s.labelKey} className="grid gap-1">
                <strong className="text-[28px] font-[var(--weight-black)] text-[var(--gt-off-white)]">{s.valueKey}</strong>
                <span className="text-sm text-[var(--gt-ink-300)]">{t(s.labelKey)}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {COURSES.map((c) => (
              <CourseCard
                key={c.id}
                tone="ink"
                course={{
                  id: c.id,
                  title: pick(c.title, lang),
                  level: pick(c.level, lang),
                  lessonCount: c.lessonCount,
                  duration: c.duration,
                  price: c.price,
                  image: c.image,
                }}
                onSelect={() => {
                  navigate("/academy/lecon");
                  showToast(t("academy.toastCourseTitle"), t("academy.toastCourseBody", { title: pick(c.title, lang) }));
                }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="px-[clamp(14px,4vw,48px)] py-[var(--section-y)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-[clamp(32px,5vw,64px)] lg:grid-cols-2">
          <div className="grid gap-4">
            <span className="gt-eyebrow">{t("academy.communityEyebrow")}</span>
            <h2 className="text-[length:var(--text-h2)]">{t("academy.communityTitle")}</h2>
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("academy.communityBody")}</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => showToast(t("common.notIncludedTitle"), t("common.notIncludedArtists"), "info")}>{t("academy.communityCta")}</Button>
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-lg)]">
            <img src={photo("mouth-04.jpg")} alt="Pose de gems en cabine" className="block h-full w-full object-cover" />
          </div>
        </div>
      </section>

      <section className="px-[clamp(14px,4vw,48px)] pb-[var(--section-y)] text-center">
        <div className="mx-auto flex max-w-[var(--max-width-content)] flex-wrap justify-center gap-3">
          <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={enroll}>{t("academy.ctaEnroll")}</Button>
        </div>
      </section>
    </div>
  );
}
