"use client";

import { useEffect, useRef, useState } from "react";
import { renderArtifactDocument, type Artifact } from "@/lib/artifacts";
import styles from "./ArtifactFrame.module.css";

/**
 * Renders an artifact at a fixed logical width and scales it down to whatever
 * space it is given, so a thumbnail and a full-bleed view are the same document
 * at different zooms — no reflow, no separate "preview" layout to keep in sync.
 *
 * The iframe is fully sandboxed (no scripts, no same-origin): this is
 * model-generated markup and it never needs to reach back into the app.
 */
export function ArtifactFrame({
  artifact,
  logicalWidth = 1200,
  interactive = false,
}: {
  artifact: Artifact;
  logicalWidth?: number;
  interactive?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const logicalHeight = Math.round(logicalWidth / artifact.aspect);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / logicalWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [logicalWidth]);

  return (
    <div ref={wrapRef} className={styles.wrap} style={{ aspectRatio: String(artifact.aspect) }}>
      {scale === 0 && <div className={styles.placeholder} />}
      <iframe
        title={artifact.title}
        srcDoc={renderArtifactDocument(artifact.body)}
        sandbox=""
        loading="lazy"
        tabIndex={-1}
        aria-hidden={!interactive}
        className={[styles.frame, interactive && styles.interactive].filter(Boolean).join(" ")}
        style={{
          width: logicalWidth,
          height: logicalHeight,
          transform: `scale(${scale})`,
          opacity: scale === 0 ? 0 : 1,
        }}
      />
    </div>
  );
}
