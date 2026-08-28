"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import styles from "./Toast.module.css";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: ReactNode;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: ReactNode, opts?: { tone?: ToastTone; durationMs?: number; action?: ToastItem["action"] }) => void;
  success: (message: ReactNode) => void;
  error: (message: ReactNode) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi["show"]>(
    (message, opts) => {
      const id = nextId.current++;
      const tone = opts?.tone ?? "info";
      // Errors linger: they usually carry something the user must read.
      const durationMs = opts?.durationMs ?? (tone === "error" ? 7000 : 3800);
      setItems((cur) => [...cur.slice(-2), { id, tone, message, action: opts?.action }]);
      setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, { tone: "success" }),
      error: (m) => show(m, { tone: "error" }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.viewport} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={[styles.toast, styles[t.tone]].join(" ")}>
            <span className={styles.dot} aria-hidden />
            <span className={styles.message}>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              className={styles.close}
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
