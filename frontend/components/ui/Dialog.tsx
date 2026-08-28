"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Dialog.module.css";

/**
 * Modal built on native <dialog>, so focus trapping, Esc, inertness of the page
 * behind, and the top-layer stacking all come from the platform.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // `cancel` covers Esc; `close` covers every other path the dialog can shut.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClose = () => onClose();
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={[styles.dialog, wide && styles.wide].filter(Boolean).join(" ")}
      onClick={(e) => {
        // Clicks land on the backdrop only when the target is the dialog itself.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          {description != null && <p className={styles.description}>{description}</p>}
        </div>
        {children != null && <div className={styles.body}>{children}</div>}
        {footer != null && <div className={styles.footer}>{footer}</div>}
      </div>
    </dialog>
  );
}
