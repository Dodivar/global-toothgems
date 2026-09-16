import { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "./Button";

interface QuizQuestionProps {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  index: number;
  total: number;
  submitLabel?: string;
  continueLabel?: string;
  onAnswer?: (picked: number, correct: boolean) => void;
}

export function QuizQuestion({
  question,
  options,
  correctIndex,
  explanation,
  index,
  total,
  submitLabel = "Valider ma réponse",
  continueLabel = "Continuer",
  onAnswer,
}: QuizQuestionProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submit = () => {
    if (picked == null) return;
    setSubmitted(true);
  };

  const cont = () => {
    if (picked == null) return;
    onAnswer?.(picked, picked === correctIndex);
  };

  const correct = picked === correctIndex;

  return (
    <section className="grid gap-5 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-[var(--space-8)]">
      <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
        Question {index} / {total}
      </span>
      <h3 className="text-[22px]">{question}</h3>
      <div className="grid gap-2.5">
        {options.map((opt, i) => {
          let border = "var(--border-default)";
          let bg = "transparent";
          if (!submitted && picked === i) {
            border = "var(--gt-ink-900)";
            bg = "var(--gt-ink-100)";
          } else if (submitted && i === correctIndex) {
            border = "var(--gt-emerald-500)";
            bg = "var(--status-success-bg)";
          } else if (submitted && picked === i && i !== correctIndex) {
            border = "var(--gt-red-500)";
            bg = "var(--status-error-bg)";
          }
          return (
            <button
              key={opt}
              type="button"
              disabled={submitted}
              onClick={() => setPicked(i)}
              className="flex items-center gap-3 rounded-[var(--radius-md)] px-4 py-3 text-left text-sm font-medium text-[var(--text-primary)] transition-colors disabled:cursor-default"
              style={{ border: `1px solid ${border}`, background: bg }}
            >
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-current text-xs">
                {submitted && i === correctIndex ? (
                  <Check size={13} strokeWidth={3} color="var(--gt-emerald-600)" />
                ) : submitted && picked === i ? (
                  <X size={13} strokeWidth={3} color="var(--gt-red-600)" />
                ) : (
                  String.fromCharCode(65 + i)
                )}
              </span>
              {opt}
            </button>
          );
        })}
      </div>
      {submitted && (
        <div
          className="rounded-[var(--radius-md)] p-4 text-sm"
          style={{
            background: correct ? "var(--status-success-bg)" : "var(--surface-brand-wash)",
            color: correct ? "var(--status-success-fg)" : "var(--text-body)",
          }}
        >
          <strong className="block pb-1">{correct ? "Correct" : "Pas tout à fait — voici pourquoi"}</strong>
          {explanation}
        </div>
      )}
      <div className="flex justify-end">
        {!submitted ? (
          <Button variant="primary" disabled={picked == null} onClick={submit}>
            {submitLabel}
          </Button>
        ) : (
          <Button variant="dark" iconRight={ArrowRight} onClick={cont}>
            {continueLabel}
          </Button>
        )}
      </div>
    </section>
  );
}
