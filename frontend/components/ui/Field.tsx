"use client";

import {
  useEffect,
  useId,
  useRef,
  type ComponentPropsWithRef,
  type ReactNode,
} from "react";
import styles from "./Field.module.css";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      {label != null && (
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error != null ? (
        <span className={styles.error}>{error}</span>
      ) : hint != null ? (
        <span className={styles.hint}>{hint}</span>
      ) : null}
    </div>
  );
}

/** React 19 passes `ref` as an ordinary prop, so use the WithRef prop types. */
export interface InputProps extends ComponentPropsWithRef<"input"> {
  invalid?: boolean;
}

export function Input({ invalid, className, ...rest }: InputProps) {
  return (
    <input
      className={[styles.control, invalid && styles.invalid, className].filter(Boolean).join(" ")}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export interface TextareaProps extends Omit<ComponentPropsWithRef<"textarea">, "ref"> {
  invalid?: boolean;
  /** Grow with content up to `maxRows`, then scroll. */
  autoResize?: boolean;
  maxRows?: number;
}

export function Textarea({
  invalid,
  autoResize = false,
  maxRows = 10,
  className,
  value,
  ...rest
}: TextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !autoResize) return;
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const padding =
      parseFloat(getComputedStyle(el).paddingTop) +
      parseFloat(getComputedStyle(el).paddingBottom);
    el.style.height = `${Math.min(el.scrollHeight, lineHeight * maxRows + padding)}px`;
  }, [value, autoResize, maxRows]);

  return (
    <textarea
      ref={ref}
      value={value}
      className={[
        styles.control,
        styles.textarea,
        autoResize && styles.textareaAuto,
        invalid && styles.invalid,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

/** Comma/Enter-separated list of short strings rendered as removable chips. */
export function ChipsInput({
  values,
  onChange,
  placeholder,
  label,
  hint,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  label?: ReactNode;
  hint?: ReactNode;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const raw = inputRef.current?.value ?? "";
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !values.includes(s));
    if (parts.length) onChange([...values, ...parts]);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className={styles.chips}>
        {values.map((v) => (
          <span key={v} className={styles.chip}>
            <span className={styles.chipText}>{v}</span>
            <button
              type="button"
              className={styles.chipRemove}
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={`Remove ${v}`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path
                  d="M3 3l6 6M9 3l-6 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </span>
        ))}
      </div>
      <Input
        id={id}
        ref={inputRef}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
      />
    </Field>
  );
}
