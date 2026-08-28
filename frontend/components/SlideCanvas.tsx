import { Fragment, type ReactNode } from "react";
import type { Slide, SlideBlock } from "@/lib/types";
import styles from "./SlideCanvas.module.css";

/** Blocks split into column groups, each started by a `heading` block. */
function groupByHeading(blocks: SlideBlock[]): { heading?: SlideBlock; items: SlideBlock[] }[] {
  const groups: { heading?: SlideBlock; items: SlideBlock[] }[] = [];
  for (const b of blocks) {
    if (b.kind === "heading" || groups.length === 0) {
      groups.push({ heading: b.kind === "heading" ? b : undefined, items: b.kind === "heading" ? [] : [b] });
    } else {
      groups[groups.length - 1].items.push(b);
    }
  }
  return groups;
}

const pick = (blocks: SlideBlock[], ...kinds: SlideBlock["kind"][]) =>
  blocks.filter((b) => kinds.includes(b.kind));

function UnsourcedTag() {
  return (
    <span className={styles.unsourced}>
      <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" aria-hidden>
        <path d="M8 2.6 15 13.6H1L8 2.6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6.6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11.6" r="0.85" fill="currentColor" />
      </svg>
      unsourced
    </span>
  );
}

export interface SlideCanvasProps {
  slide: Slide;
  /** Show the "unsourced" marker on metrics with no provenance. Off in present mode. */
  showProvenance?: boolean;
  bordered?: boolean;
  className?: string;
}

export function SlideCanvas({
  slide,
  showProvenance = true,
  bordered = true,
  className,
}: SlideCanvasProps) {
  const { template, title, blocks } = slide;
  const hasImage = Boolean(slide.image_url);
  const wantsImage = Boolean(slide.image_prompt) && !hasImage;
  const imageBacked = template === "image_full" || (hasImage && template === "hero");

  const frameClass = [
    styles.frame,
    bordered && styles.bordered,
    imageBacked && hasImage && styles.onImage,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  let body: ReactNode;

  switch (template) {
    case "hero": {
      const text = pick(blocks, "text", "heading");
      body = (
        <div className={`${styles.pad} ${styles.hero}`}>
          <span className={styles.accentRule} />
          <div className={`${styles.title} ${styles.heroTitle}`}>{title}</div>
          {/* One supporting line only — a hero with two paragraphs stops being a hero
              and starts overflowing the 16:9 frame. */}
          {text.slice(0, 1).map((b, i) => (
            <div key={i} className={`${styles.text} ${styles.heroText}`}>
              {b.text}
            </div>
          ))}
        </div>
      );
      break;
    }

    case "two_column": {
      const groups = groupByHeading(blocks).slice(0, 2);
      body = (
        <div className={styles.pad}>
          <div className={`${styles.title} ${styles.titleSm}`}>{title}</div>
          <div className={styles.columns}>
            {groups.map((g, i) => (
              <div key={i} className={styles.column}>
                <span className={styles.columnRule} />
                {g.heading && <div className={styles.heading}>{g.heading.text}</div>}
                <div className={styles.bullets}>
                  {g.items.map((b, j) => (
                    <div key={j} className={styles.bullet}>
                      {b.kind === "bullet" && <span className={styles.bulletDot} aria-hidden />}
                      <span>{b.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
      break;
    }

    case "metrics": {
      const metrics = pick(blocks, "metric").slice(0, 4);
      const caption = pick(blocks, "text")[0];
      body = (
        <div className={styles.pad}>
          <div className={`${styles.title} ${styles.titleSm}`}>{title}</div>
          <div className={styles.metrics}>
            {metrics.map((m, i) => (
              <div key={i} className={styles.metric}>
                {showProvenance && !m.source_ref && <UnsourcedTag />}
                <div className={styles.metricValue}>{m.value || "—"}</div>
                <div className={styles.metricLabel}>{m.text}</div>
                {m.source_ref && (
                  <div className={styles.metricSource} title={m.source_ref}>
                    {m.source_ref}
                  </div>
                )}
              </div>
            ))}
          </div>
          {caption && <div className={styles.text}>{caption.text}</div>}
        </div>
      );
      break;
    }

    case "quote": {
      const q = pick(blocks, "quote", "text")[0];
      const attrib = blocks.find((b) => b !== q && (b.kind === "text" || b.kind === "heading"));
      body = (
        <div className={`${styles.pad}`}>
          <div className={styles.quoteWrap}>
            <div className={styles.quoteMark} aria-hidden>
              &ldquo;
            </div>
            <div className={styles.quoteText}>{q?.text || title}</div>
            {attrib && <div className={styles.quoteAttrib}>— {attrib.text}</div>}
          </div>
        </div>
      );
      break;
    }

    case "diagram": {
      // Four is the most that stays legible in one non-wrapping row.
      const nodes = pick(blocks, "diagram_node", "bullet", "text").slice(0, 4);
      body = (
        <div className={styles.pad}>
          <div className={`${styles.title} ${styles.titleSm}`}>{title}</div>
          <div className={styles.diagram}>
            {nodes.map((n, i) => (
              <Fragment key={i}>
                <div className={styles.node}>{n.text}</div>
                {i < nodes.length - 1 && (
                  <span className={styles.nodeArrow} aria-hidden>
                    →
                  </span>
                )}
              </Fragment>
            ))}
          </div>
        </div>
      );
      break;
    }

    case "timeline": {
      const items = pick(blocks, "bullet", "text", "diagram_node").slice(0, 5);
      body = (
        <div className={styles.pad}>
          <div className={`${styles.title} ${styles.titleSm}`}>{title}</div>
          <div className={styles.timeline}>
            <span className={styles.timelineLine} aria-hidden />
            {items.map((it, i) => (
              <div key={i} className={styles.timelineItem}>
                <span className={styles.timelineDot} aria-hidden />
                <div className={styles.timelineLabel}>
                  {it.value && <strong>{it.value} · </strong>}
                  {it.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
      break;
    }

    case "image_full": {
      const caption = pick(blocks, "text", "heading")[0];
      body = (
        <div className={`${styles.pad} ${styles.hero}`}>
          <div className={`${styles.title} ${styles.heroTitle}`}>{title}</div>
          {caption && <div className={`${styles.text} ${styles.heroText}`}>{caption.text}</div>}
        </div>
      );
      break;
    }

    case "closing": {
      const text = pick(blocks, "text", "heading")[0];
      body = (
        <div className={`${styles.pad} ${styles.closing}`}>
          <div className={`${styles.title} ${styles.closingTitle}`}>{title}</div>
          {text && <div className={styles.text}>{text.text}</div>}
          <span className={styles.accentRule} />
        </div>
      );
      break;
    }

    case "bullets":
    default: {
      const items = pick(blocks, "bullet", "text", "heading");
      body = (
        <div className={styles.pad}>
          <div className={`${styles.title} ${styles.titleSm}`}>{title}</div>
          <div className={styles.bullets}>
            {items.slice(0, 6).map((b, i) =>
              b.kind === "heading" ? (
                <div key={i} className={styles.heading}>
                  {b.text}
                </div>
              ) : (
                <div key={i} className={styles.bullet}>
                  <span className={styles.bulletDot} aria-hidden />
                  <span>
                    {b.text}
                    {b.value ? ` — ${b.value}` : ""}
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
      );
    }
  }

  const isEmpty = !title && blocks.length === 0;

  return (
    <div className={frameClass}>
      {hasImage && imageBacked && (
        <>
          {/* Slide imagery is generated per deck, so next/image's optimiser has
              nothing to add over a plain img here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slide.image_url} alt="" className={styles.bgImage} />
          <div className={styles.scrim} aria-hidden />
        </>
      )}
      {wantsImage && template === "image_full" && (
        <div className={styles.imagePending} aria-hidden>
          <span className={styles.pendingBadge}>Generating image…</span>
        </div>
      )}
      {isEmpty ? <div className={styles.blank}>Empty slide</div> : body}
    </div>
  );
}
