import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert } from "lucide-react";

type ToastTone = "success" | "info" | "warning";

interface Toast {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (title: string, message?: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneIcon: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
};
const toneColor: Record<ToastTone, string> = {
  success: "var(--status-success-fg)",
  info: "var(--status-info-fg)",
  warning: "var(--status-warning-fg)",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((title: string, message?: string, tone: ToastTone = "success") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, title, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[999] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => {
          const Icon = toneIcon[t.tone];
          return (
            <div
              key={t.id}
              className="gt-glass pointer-events-auto flex w-full max-w-[380px] items-start gap-3 rounded-[var(--radius-md)] p-[var(--space-4)]"
            >
              <Icon size={18} color={toneColor[t.tone]} className="mt-0.5 flex-none" />
              <div className="grid gap-0.5">
                <strong className="text-sm text-[var(--text-primary)]">{t.title}</strong>
                {t.message && <span className="text-xs text-[var(--text-body)]">{t.message}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
