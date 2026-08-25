"use client";

import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PageHeader, SectionHeader } from "@/components/PageHeader";
import { SlideCanvas } from "@/components/SlideCanvas";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { supportsViewTransition } from "@/components/ViewTransition";
import { AgentSteps, GenerativeFrame, ShimmerLabel } from "@/components/ui/Generating";
import { ChipsInput, Field, Input, Textarea } from "@/components/ui/Field";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Alert, EmptyState, LoadingBlock, Skeleton, Spinner } from "@/components/ui/Status";
import { useToast } from "@/components/ui/Toast";
import { SAMPLE_SLIDES } from "@/lib/sampleSlides";
import styles from "./styleguide.module.css";

const SEMANTIC_TOKENS = [
  "--bg",
  "--bg-sunken",
  "--surface",
  "--surface-raised",
  "--surface-hover",
  "--surface-inset",
  "--border",
  "--border-subtle",
  "--border-strong",
  "--accent",
  "--accent-subtle",
  "--success",
  "--success-subtle",
  "--warning",
  "--warning-subtle",
  "--danger",
  "--danger-subtle",
  "--info",
  "--info-subtle",
];

const TYPE_SCALE: [string, string][] = [
  ["--text-4xl", "40"],
  ["--text-3xl", "32"],
  ["--text-2xl", "24"],
  ["--text-xl", "20"],
  ["--text-lg", "16"],
  ["--text-md", "14"],
  ["--text-base", "13"],
  ["--text-sm", "12"],
  ["--text-xs", "11"],
];

const TONES: BadgeTone[] = ["neutral", "accent", "success", "warning", "danger", "info", "outline"];

const ALL_ICONS: IconName[] = [
  "brief", "sources", "outline", "deck", "rehearse", "present", "debrief", "versions",
  "plus", "check", "checkCircle", "sparkle", "lock", "unlock", "mic", "micOff", "play", "stop",
  "arrowRight", "arrowLeft", "chevronRight", "chevronDown", "external", "google", "warning",
  "info", "more", "trash", "edit", "refresh", "sun", "moon", "clock", "users", "send", "branch",
  "download", "search", "close", "thumbUp", "thumbDown", "quote", "image", "link", "logo",
];

/**
 * Living reference for the design system. Also the only place every slide
 * template is rendered at once, which is how layout regressions get caught.
 */
export default function StyleguidePage() {
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [chips, setChips] = useState<string[]>(["priya@bessemer.com"]);

  return (
    <div className={styles.page}>
      <AppHeader docTitle="Styleguide" />
      <main className={styles.main}>
        <PageHeader
          eyebrow="Internal"
          title="Design system"
          description="Every primitive and every slide template in one place. If something looks wrong here, it is wrong everywhere."
        />

        <section>
          <SectionHeader title="Semantic colour" first />
          <div className={styles.swatches}>
            {SEMANTIC_TOKENS.map((token) => (
              <div key={token} className={styles.swatch}>
                <div className={styles.chip} style={{ background: `var(${token})` }} />
                <span className={styles.swatchName}>{token.replace("--", "")}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title="Type scale" />
          <div>
            {TYPE_SCALE.map(([token, px]) => (
              <div key={token} className={styles.typeRow}>
                <span className={styles.typeLabel}>{px}px</span>
                <span style={{ fontSize: `var(${token})` }}>
                  Prepare, present, follow up
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title="Buttons" />
          <div className={styles.stack}>
            <div className={styles.row}>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="tonal">Tonal</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="dangerGhost">Danger ghost</Button>
            </div>
            <div className={styles.row}>
              <Button size="lg" variant="primary" leading={<Icon name="sparkle" size={17} />}>
                Large with icon
              </Button>
              <Button variant="secondary" trailing={<Icon name="arrowRight" size={16} />}>
                Trailing icon
              </Button>
              <Button size="sm" variant="secondary">
                Small
              </Button>
              <Button variant="secondary" iconOnly leading={<Icon name="more" size={16} />} aria-label="More" />
              <Button variant="primary" pending>
                Pending
              </Button>
              <Button variant="primary" disabled>
                Disabled
              </Button>
            </div>
          </div>
        </section>

        <section>
          <SectionHeader title="Badges" />
          <div className={styles.row}>
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone}>
                {tone}
              </Badge>
            ))}
            <Badge tone="accent" pill dot>
              pill + dot
            </Badge>
            <Badge tone="danger" pill live>
              live
            </Badge>
          </div>
        </section>

        <section>
          <SectionHeader title="Form controls" />
          <div className={styles.grid2}>
            <Card>
              <div className={styles.stack}>
                <Field label="Label" hint="Helper text sits here.">
                  <Input placeholder="Placeholder" />
                </Field>
                <Field label="Invalid" error="Something is wrong with this value.">
                  <Input defaultValue="bad value" invalid />
                </Field>
                <Field label="Disabled">
                  <Input placeholder="Disabled" disabled />
                </Field>
              </div>
            </Card>
            <Card>
              <div className={styles.stack}>
                <Field label="Textarea">
                  <Textarea rows={3} placeholder="Multi-line input…" />
                </Field>
                <ChipsInput
                  label="Attendees"
                  hint="Enter or comma to add."
                  values={chips}
                  onChange={setChips}
                  placeholder="name@company.com"
                />
              </div>
            </Card>
          </div>
        </section>

        <section>
          <SectionHeader title="Feedback" />
          <div className={styles.stack}>
            <Alert tone="info" title="Informational">
              The worker exports to Slides and drafts the recap email.
            </Alert>
            <Alert tone="success" title="Ready to lock">
              Every section has slides and every number has a source.
            </Alert>
            <Alert tone="warning" title="Needs a decision">
              Two inputs conflict — which revenue figure should the slide use?
            </Alert>
            <Alert
              tone="danger"
              title="Could not build that section"
              actions={<Button size="sm" variant="secondary">Retry</Button>}
            >
              The model returned an empty response.
            </Alert>
            <div className={styles.row}>
              <Button variant="secondary" onClick={() => toast.success("Slide approved")}>
                Toast success
              </Button>
              <Button variant="secondary" onClick={() => toast.error("Could not reach the API")}>
                Toast error
              </Button>
              <Button variant="secondary" onClick={() => setDialogOpen(true)}>
                Open dialog
              </Button>
            </div>
          </div>
        </section>

        <section>
          <SectionHeader title="Loading and empty" />
          <div className={styles.grid2}>
            <Card>
              <CardHeader title="Skeleton" subtitle="Matches the shape of what is coming" />
              <div className={styles.stack}>
                <Skeleton width="60%" height={20} />
                <Skeleton />
                <Skeleton width="80%" />
              </div>
            </Card>
            <Card pad="none">
              <EmptyState
                icon={<Icon name="outline" size={24} />}
                title="No outline yet"
                body="The planner will propose sections from your brief."
                actions={<Button variant="primary" size="sm">Propose outline</Button>}
                compact
              />
            </Card>
            <Card>
              <LoadingBlock label="Running checks…" />
            </Card>
            <Card>
              <CardHeader title="Spinners" />
              <div className={styles.row}>
                <Spinner size={16} />
                <Spinner size={20} />
                <Spinner size={28} />
              </div>
            </Card>
          </div>
        </section>

        <section>
          <SectionHeader title="Environment" first={false} />
          <div className={styles.row}>
            <Badge tone={supportsViewTransition ? "success" : "warning"} dot>
              View transitions {supportsViewTransition ? "active" : "unavailable"}
            </Badge>
          </div>
        </section>

        <section>
          <SectionHeader title="Agent presence" />
          <div className={styles.grid2}>
            <Card>
              <CardHeader title="Working label" subtitle="Shimmer sweep while the agent runs" />
              <div className={styles.stack}>
                <ShimmerLabel>Building slides for “Market traction”…</ShimmerLabel>
                <ShimmerLabel icon={false}>Listening</ShimmerLabel>
              </div>
            </Card>
            <Card>
              <CardHeader title="Step trace" subtitle="What it is doing, in order" />
              <AgentSteps
                steps={[
                  { label: "Read the brief", state: "done" },
                  { label: "Pull facts from sources", state: "done" },
                  { label: "Draft slides", state: "active" },
                  { label: "Generate imagery", state: "pending" },
                ]}
              />
            </Card>
          </div>
          <div style={{ marginTop: "var(--s4)" }}>
            <GenerativeFrame active className={styles.genDemo}>
              <Card>
                <CardHeader
                  title="Slide being rewritten"
                  subtitle="The frame marks exactly what the agent is touching."
                />
                <SlideCanvas slide={SAMPLE_SLIDES[2]} />
              </Card>
            </GenerativeFrame>
          </div>
        </section>

        <section>
          <SectionHeader title="Icons" />
          <div className={styles.row}>
            {ALL_ICONS.map((name) => (
              <span key={name} title={name} style={{ color: "var(--text-secondary)" }}>
                <Icon name={name} size={20} />
              </span>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title="Slide templates" />
          <div className={styles.slides}>
            {SAMPLE_SLIDES.map((slide) => (
              <div key={slide.template} className={styles.slideCell}>
                <SlideCanvas slide={slide} />
                <span className={styles.slideName}>{slide.template}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Dialog title"
        description="Built on the native dialog element, so focus and Esc come from the platform."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setDialogOpen(false)}>
              Confirm
            </Button>
          </>
        }
      >
        <Field label="A field inside a dialog">
          <Input placeholder="Type something" />
        </Field>
      </Dialog>
    </div>
  );
}
