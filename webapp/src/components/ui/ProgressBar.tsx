import { Check } from "lucide-react";

interface ProgressBarBase {
  label?: string;
  tone?: "emerald" | "ink" | "brand";
}

interface BarProps extends ProgressBarBase {
  variant?: "bar";
  value: number;
  showValue?: boolean;
  size?: "sm" | "md" | "lg";
}

interface StepsProps extends ProgressBarBase {
  variant: "steps";
  steps: string[];
  current: number;
}

type ProgressBarProps = BarProps | StepsProps;

const toneColor: Record<string, string> = {
  emerald: "var(--accent-cta)",
  ink: "var(--gt-ink-900)",
  brand: "var(--surface-brand)",
};

const barHeight: Record<string, number> = { sm: 4, md: 6, lg: 10 };

export function ProgressBar(props: ProgressBarProps) {
  const tone = props.tone ?? "emerald";
  const fill = toneColor[tone];

  if (props.variant === "steps") {
    const { steps, current, label } = props;
    return (
      <div className="grid gap-2">
        {label && <span className="text-xs font-medium text-[var(--text-muted)]">{label}</span>}
        <div className="flex items-center">
          {steps.map((step, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <div key={step} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                    style={{
                      background: done || active ? fill : "var(--surface-sunken)",
                      color: done || active ? (tone === "emerald" ? "var(--text-on-accent)" : "var(--text-inverse)") : "var(--text-muted)",
                      border: done || active ? "none" : "1px solid var(--border-subtle)",
                    }}
                  >
                    {done ? <Check size={13} strokeWidth={3} /> : i + 1}
                  </span>
                  <span
                    className="whitespace-nowrap text-[11px] font-medium"
                    style={{ color: active ? "var(--text-primary)" : "var(--text-muted)" }}
                  >
                    {step}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <span className="mx-2 h-px flex-1" style={{ background: i < current ? fill : "var(--border-subtle)" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const { value, showValue = true, size = "md", label } = props;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="grid gap-1.5">
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
          {label && <span>{label}</span>}
          {showValue && <span>{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-sunken)]"
        style={{ height: barHeight[size] }}
      >
        <div
          className="h-full rounded-[var(--radius-pill)] transition-[width]"
          style={{ width: `${pct}%`, background: fill, transitionDuration: "var(--duration-slow)" }}
        />
      </div>
    </div>
  );
}
