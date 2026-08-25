"use client";

import { useSyncExternalStore } from "react";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";

type Theme = "light" | "dark";

const THEME_EVENT = "deckhand:themechange";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

/** An explicit choice on <html> wins; otherwise follow the OS. */
function getTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  // The theme is browser state, not React state, so read it from the DOM rather
  // than mirroring it — that also avoids a hydration mismatch on the icon.
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as Theme);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("deckhand-theme", next);
    } catch {
      /* private browsing — the toggle still works for this session */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <Button
      variant="ghost"
      iconOnly
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      leading={<Icon name={theme === "dark" ? "sun" : "moon"} size={18} />}
    />
  );
}
