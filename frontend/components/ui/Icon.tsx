import type { SVGProps } from "react";

/**
 * One consistent line-icon set: 24x24 grid, 1.6 stroke, round caps, currentColor.
 * Self-contained on purpose — no icon package to version-drift against.
 */
export type IconName =
  | "brief"
  | "sources"
  | "outline"
  | "deck"
  | "rehearse"
  | "present"
  | "debrief"
  | "versions"
  | "plus"
  | "check"
  | "checkCircle"
  | "sparkle"
  | "lock"
  | "unlock"
  | "mic"
  | "micOff"
  | "play"
  | "stop"
  | "arrowRight"
  | "arrowLeft"
  | "chevronRight"
  | "chevronDown"
  | "external"
  | "google"
  | "warning"
  | "info"
  | "more"
  | "trash"
  | "edit"
  | "refresh"
  | "sun"
  | "moon"
  | "clock"
  | "users"
  | "send"
  | "branch"
  | "download"
  | "search"
  | "close"
  | "thumbUp"
  | "thumbDown"
  | "quote"
  | "image"
  | "link"
  | "logo";

const paths: Record<IconName, React.ReactNode> = {
  brief: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4V5.5Z" />
      <path d="M8 8h8M8 11.5h5" />
    </>
  ),
  sources: (
    <>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h7A1.5 1.5 0 0 1 19 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5v-11Z" />
      <path d="M7 12.5h8M7 15.5h5" />
    </>
  ),
  outline: (
    <>
      <path d="M4 6h3M4 12h3M4 18h3" />
      <path d="M10 6h10M10 12h10M10 18h7" />
    </>
  ),
  deck: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="M8.5 20h7M12 16.5V20" />
    </>
  ),
  rehearse: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12 2.4 2.4 4.6-4.8" />
    </>
  ),
  present: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="m10.5 8.5 4.5 2.5-4.5 2.5v-5Z" />
      <path d="M8.5 20h7" />
    </>
  ),
  debrief: (
    <>
      <path d="M5 4.5h9.5L19 9v10.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-15Z" />
      <path d="M14 4.5V9h5M8.5 13h7M8.5 16h4" />
    </>
  ),
  versions: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.2 2.6 2.6 5-5.4" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5Z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="1.8" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </>
  ),
  unlock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="1.8" />
      <path d="M8 10.5V7.8a4 4 0 0 1 7.7-1.5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </>
  ),
  micOff: (
    <>
      <path d="M9 9.2V6a3 3 0 0 1 5.9-.7M15 11v.5a3 3 0 0 1-4.3 2.7" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 10.2 5.3M12 18v3M4 4l16 16" />
    </>
  ),
  play: <path d="M8 5.5 18 12 8 18.5v-13Z" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />,
  arrowRight: <path d="M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5" />,
  arrowLeft: <path d="M20 12H5m0 0 5.5-5.5M5 12l5.5 5.5" />,
  chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  chevronDown: <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />,
  external: (
    <>
      <path d="M13.5 5H19v5.5" />
      <path d="M19 5l-8 8" />
      <path d="M18 14.5v3.7a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 18.2V7.8A1.8 1.8 0 0 1 5.8 6h3.7" />
    </>
  ),
  google: (
    <>
      <path d="M20.6 12.2c0-.6-.05-1.2-.16-1.8H12v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5Z" />
      <path d="M12 21c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.55-1.85.87-3.1.87-2.4 0-4.4-1.6-5.1-3.75H3.9v2.3A9 9 0 0 0 12 21Z" />
      <path d="M6.9 13.7a5.4 5.4 0 0 1 0-3.4V8H3.9a9 9 0 0 0 0 8l3-2.3Z" />
      <path d="M12 6.6c1.3 0 2.5.45 3.45 1.35l2.58-2.58A9 9 0 0 0 3.9 8l3 2.3C7.6 8.2 9.6 6.6 12 6.6Z" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.8 21.2 19.5H2.8L12 3.8Z" />
      <path d="M12 9.8v4" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11.2v5" />
      <circle cx="12" cy="7.9" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15M9.5 6.5V4.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8v1.7" />
      <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
      <path d="M10.5 10v6.5M13.5 10v6.5" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14.5 5.5 3 3" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.5-5.8" />
      <path d="M20 4.5V10h-5.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.2 1.9" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.8 19.5a6.4 6.4 0 0 1 12.4 0" />
      <path d="M16 5.4a3.5 3.5 0 0 1 0 6.6M17.5 14.2a6.4 6.4 0 0 1 3.7 5.3" />
    </>
  ),
  send: <path d="M4.5 12 20 4.5l-4 15.5-4.2-6-6-2h-1.3Z" />,
  branch: (
    <>
      <circle cx="7" cy="6" r="2.5" />
      <circle cx="7" cy="18" r="2.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M7 8.5v7M9.4 7.4A5.5 5.5 0 0 0 14.5 9M17 11.5c0 3-2.6 4-5.5 4.5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11m0 0 4-4m-4 4-4-4" />
      <path d="M4.5 16.5v2A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m15.8 15.8 4.2 4.2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  thumbUp: (
    <>
      <path d="M7 10.5v9H4.5a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5H7Z" />
      <path d="M7 10.5 11.2 4a2 2 0 0 1 2.8 2.4l-1 4.1h5a1.8 1.8 0 0 1 1.75 2.25l-1.4 5.4A2 2 0 0 1 15.4 19.5H7" />
    </>
  ),
  thumbDown: (
    <>
      <path d="M7 13.5v-9H4.5a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5H7Z" />
      <path d="M7 13.5 11.2 20a2 2 0 0 0 2.8-2.4l-1-4.1h5a1.8 1.8 0 0 0 1.75-2.25l-1.4-5.4A2 2 0 0 0 15.4 4.5H7" />
    </>
  ),
  quote: (
    <>
      <path d="M9.5 6.5C6.9 7.7 5.5 9.9 5.5 13v4.5h5V12H8c0-1.9.6-3.2 2.2-4l-.7-1.5Z" />
      <path d="M18 6.5c-2.6 1.2-4 3.4-4 6.5v4.5h5V12h-2.5c0-1.9.6-3.2 2.2-4L18 6.5Z" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.8" />
      <circle cx="8.6" cy="10" r="1.6" />
      <path d="m4.5 17 4.6-4.4L14 17M13 14.5l2.6-2.4 3.9 3.6" />
    </>
  ),
  link: (
    <>
      <path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.54 3.54 0 0 0-5-5l-1.6 1.6" />
      <path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.54 3.54 0 0 0 5 5l1.6-1.6" />
    </>
  ),
  // Two stacked slides: reads as "deck" at 16px, where a monitor glyph reads as
  // a generic screen.
  logo: (
    <>
      <path d="M3.6 6.4A1.9 1.9 0 0 1 5.5 4.5h9.2a1.9 1.9 0 0 1 1.9 1.9v6.4" opacity="0.55" />
      <rect x="7.3" y="8.4" width="13.1" height="9.6" rx="2.1" />
      <path d="M10.6 12.2h6.5M10.6 14.8h3.9" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  /** Google's own multi-colour mark reads wrong as a monochrome outline. */
  filled?: boolean;
}

export function Icon({ name, size = 20, filled = false, ...rest }: IconProps) {
  const isFilledGlyph = filled || name === "google" || name === "play" || name === "send";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={isFilledGlyph ? "currentColor" : "none"}
      stroke={isFilledGlyph ? "none" : "currentColor"}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
