import * as React from "react";

/**
 * `ViewTransition` ships in the React canary that the Next App Router bundles,
 * but `@types/react` (19 stable) does not declare it. Rather than augment the
 * react module globally, the cast is isolated here — and if the export is ever
 * missing, this renders children untouched instead of crashing.
 */

/** Class name(s) to apply, or a map from transition type to class name. */
type Anim = string | Record<string, string>;

export interface ViewTransitionProps {
  children: React.ReactNode;
  /** Shared name — the same name on two screens morphs one into the other. */
  name?: string;
  enter?: Anim;
  exit?: Anim;
  update?: Anim;
  share?: Anim;
  default?: Anim;
}

const Impl = (React as unknown as { ViewTransition?: React.ComponentType<ViewTransitionProps> })
  .ViewTransition;

export const supportsViewTransition = Impl != null;

export function ViewTransition({ children, ...props }: ViewTransitionProps) {
  if (!Impl) return <>{children}</>;
  return <Impl {...props}>{children}</Impl>;
}

/** Directional page wrapper: forward slides left, back slides right. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
