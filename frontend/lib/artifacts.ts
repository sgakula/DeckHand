/**
 * An artifact is whatever the agent made: a slide, a landing page, a chart, a
 * memo. Under the hood it is HTML; in the product nobody ever sees that. The
 * canvas renders it, and every interaction is with the rendered thing.
 */

export type ArtifactKind =
  | "slide"
  | "page"
  | "chart"
  | "diagram"
  | "doc"
  | "email"
  | "ui";

export type ArtifactState = "ready" | "generating" | "review";

export interface Artifact {
  id: string;
  title: string;
  kind: ArtifactKind;
  /** width / height of the artifact's own canvas. */
  aspect: number;
  body: string;
  state: ArtifactState;
  version: number;
  updatedAt: string;
  /** Collaborator id of whoever last touched it. */
  updatedBy: string;
  /** Short note the agent left about what it just changed. */
  lastChange?: string;
}

export interface Collaborator {
  id: string;
  name: string;
  initials: string;
  color: string;
  /** Artifact the person currently has open, if any. */
  viewing?: string;
}

export interface WorkspaceSource {
  id: string;
  label: string;
  kind: "sheet" | "doc" | "url" | "upload";
  detail: string;
}

export interface HistoryEntry {
  id: string;
  at: string;
  actor: string;
  summary: string;
  artifactIds: string[];
}

export const KIND_LABEL: Record<ArtifactKind, string> = {
  slide: "Slide",
  page: "Page",
  chart: "Chart",
  diagram: "Diagram",
  doc: "Doc",
  email: "Email",
  ui: "Interface",
};

/**
 * Shared chrome for every artifact so fixtures stay small and one typographic
 * system covers all of them. Artifacts supply body markup and their own rules.
 */
export function renderArtifactDocument(body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans+Code:wght@400;500&family=Google+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;height:100%}
  body{
    font-family:"Google Sans",system-ui,-apple-system,sans-serif;
    color:#15181d;background:#fff;
    -webkit-font-smoothing:antialiased;
    display:flex;flex-direction:column;
    --ink:#15181d;--muted:#5b6270;--line:#e4e7ec;--tint:#f5f7fa;--brand:#5f66f0;
  }
  h1,h2,h3,p,ul,ol{margin:0}
  ul,ol{padding:0;list-style:none}
  em{font-style:normal;color:var(--brand)}
  .pad{flex:1;display:flex;flex-direction:column;padding:64px 72px;gap:28px}
  .eyebrow{font-size:15px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--brand)}
  .rule{width:84px;height:5px;border-radius:99px;background:var(--brand)}
</style></head><body>${body}</body></html>`;
}

// ---------------------------------------------------------------- fixtures

const slidePitch = `<div class="pad" style="justify-content:center;gap:22px">
  <span class="rule"></span>
  <h1 style="font-size:62px;line-height:1.08;letter-spacing:-.03em;font-weight:700;max-width:15ch">
    Every team ships <em>four times</em> slower than they think</h1>
  <p style="font-size:26px;line-height:1.45;color:var(--muted);max-width:34ch">
    We measured 2,300 releases. The bottleneck was never the code.</p>
</div>`;

const chartRevenue = `<div class="pad" style="gap:22px">
  <div><span class="eyebrow">Net revenue retention</span>
  <h2 style="font-size:38px;letter-spacing:-.02em;margin-top:8px;font-weight:700">142% and climbing</h2></div>
  <div style="flex:1;display:flex;align-items:flex-end;gap:22px;padding-top:12px">
    ${[
      ["Q1", 148, "104%"],
      ["Q2", 196, "118%"],
      ["Q3", 232, "127%"],
      ["Q4", 272, "142%"],
    ]
      .map(
        // Heights are px against the artifact's fixed logical canvas, so they are
        // deterministic — a percentage here would collapse without a definite parent.
        ([q, h, v]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:12px">
      <span style="font-size:22px;font-weight:700;letter-spacing:-.02em">${v}</span>
      <div style="width:100%;height:${h}px;border-radius:14px 14px 4px 4px;
        background:linear-gradient(180deg,#7c86ff,#5f66f0)"></div>
      <span style="font-size:19px;color:var(--muted)">${q}</span></div>`,
      )
      .join("")}
  </div>
  <p style="font-size:17px;color:var(--muted);border-top:1px solid var(--line);padding-top:16px">
    Source · revenue.xlsx › Summary!B12</p>
</div>`;

const diagramFlywheel = `<div class="pad" style="gap:26px">
  <h2 style="font-size:38px;letter-spacing:-.02em;font-weight:700">How the loop compounds</h2>
  <div style="flex:1;display:flex;align-items:center;gap:14px">
    ${["Land one core team", "Adjacent teams adopt", "Expansion revenue", "Reinvest in product"]
      .map(
        (n, i) => `<div style="flex:1;display:flex;align-items:center;gap:14px">
        <div style="flex:1;padding:26px 20px;border-radius:18px;background:var(--tint);
          border:1.5px solid var(--line);font-size:20px;line-height:1.35;text-align:center">${n}</div>
        ${i < 3 ? '<span style="color:var(--brand);font-size:26px">&rarr;</span>' : ""}
      </div>`,
      )
      .join("")}
  </div>
</div>`;

const pageLanding = `<div style="flex:1;display:flex;flex-direction:column">
  <header style="display:flex;align-items:center;justify-content:space-between;
    padding:26px 56px;border-bottom:1px solid var(--line)">
    <div style="display:flex;align-items:center;gap:11px;font-weight:700;font-size:21px">
      <span style="width:26px;height:26px;border-radius:8px;background:var(--brand)"></span>Meridian</div>
    <div style="display:flex;gap:30px;font-size:17px;color:var(--muted)">
      <span>Product</span><span>Pricing</span><span>Docs</span></div>
    <span style="padding:11px 22px;border-radius:99px;background:var(--ink);color:#fff;font-size:16px;font-weight:500">
      Start free</span>
  </header>
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
    text-align:center;gap:22px;padding:56px">
    <span style="padding:7px 16px;border-radius:99px;background:#eef0ff;color:var(--brand);
      font-size:15px;font-weight:500">Now with live collaboration</span>
    <h1 style="font-size:60px;line-height:1.06;letter-spacing:-.035em;font-weight:700;max-width:17ch">
      Ship the thing you actually meant to build</h1>
    <p style="font-size:22px;color:var(--muted);max-width:44ch;line-height:1.5">
      One workspace for the whole team. Describe it, watch it render, keep every version.</p>
    <div style="display:flex;gap:14px;margin-top:8px">
      <span style="padding:15px 32px;border-radius:99px;background:var(--brand);color:#fff;
        font-size:18px;font-weight:500">Get started</span>
      <span style="padding:15px 32px;border-radius:99px;border:1.5px solid var(--line);
        font-size:18px;font-weight:500">Book a demo</span></div>
  </div>
</div>`;

const docMemo = `<div class="pad" style="padding:60px 96px;gap:20px">
  <span class="eyebrow">Internal memo</span>
  <h2 style="font-size:36px;letter-spacing:-.02em;font-weight:700">Why we are raising now</h2>
  <p style="font-size:19px;line-height:1.65;color:var(--muted)">
    Three things changed this quarter that make the next twelve months materially
    cheaper to execute than the last twelve.</p>
  <ol style="display:flex;flex-direction:column;gap:15px;counter-reset:i">
    ${[
      "Enterprise procurement stopped being the long pole. Median cycle fell from 94 to 38 days.",
      "Self-serve now covers its own acquisition cost, so every sales hire is margin.",
      "The infrastructure rewrite landed, cutting unit cost per workspace by 61%.",
    ]
      .map(
        (t) => `<li style="display:flex;gap:15px;font-size:19px;line-height:1.55">
        <span style="flex:none;width:28px;height:28px;border-radius:50%;background:#eef0ff;
          color:var(--brand);font-weight:700;font-size:15px;display:grid;place-items:center;
          counter-increment:i;">&#8203;</span><span>${t}</span></li>`,
      )
      .join("")}
  </ol>
  <p style="font-size:16px;color:var(--muted);border-top:1px solid var(--line);padding-top:16px;margin-top:auto">
    Drafted from board-update.gdoc and revenue.xlsx</p>
</div>`;

const emailRecap = `<div style="flex:1;display:flex;flex-direction:column;background:var(--tint)">
  <div style="margin:44px;background:#fff;border-radius:18px;border:1px solid var(--line);
    flex:1;display:flex;flex-direction:column;overflow:hidden">
    <div style="padding:24px 34px;border-bottom:1px solid var(--line);display:flex;
      flex-direction:column;gap:5px">
      <span style="font-size:16px;color:var(--muted)">To · priya@bessemer.com, dan@bessemer.com</span>
      <span style="font-size:22px;font-weight:700;letter-spacing:-.01em">Thanks — and the churn number you asked for</span>
    </div>
    <div style="padding:30px 34px;display:flex;flex-direction:column;gap:17px;font-size:19px;line-height:1.6">
      <p>Priya — you asked about logo churn during the deck. It is <em>3.1% annually</em>,
        and I have attached the cohort breakdown.</p>
      <p style="color:var(--muted)">I have also pulled the three follow-ups we committed to:</p>
      <ul style="display:flex;flex-direction:column;gap:10px">
        ${["Send the cohort breakdown by Friday", "Intro to two reference customers", "Share the hiring plan through Q3"]
          .map(
            (t) => `<li style="display:flex;gap:12px;align-items:flex-start">
          <span style="flex:none;width:20px;height:20px;border-radius:6px;background:#eef0ff;
            color:var(--brand);font-size:13px;display:grid;place-items:center;margin-top:3px">&#10003;</span>
          <span>${t}</span></li>`,
          )
          .join("")}
      </ul>
    </div>
  </div>
</div>`;

const uiPricing = `<div class="pad" style="gap:26px;background:var(--tint)">
  <h2 style="font-size:34px;letter-spacing:-.02em;font-weight:700;text-align:center">Simple pricing</h2>
  <div style="flex:1;display:flex;gap:20px;align-items:stretch">
    ${[
      ["Solo", "$0", "For one person thinking out loud", false],
      ["Team", "$24", "Shared workspaces and live cursors", true],
      ["Scale", "Custom", "SSO, audit log, private models", false],
    ]
      .map(
        ([name, price, blurb, featured]) => `<div style="flex:1;display:flex;flex-direction:column;gap:14px;
        padding:30px 26px;border-radius:20px;background:#fff;
        border:${featured ? "2px solid var(--brand)" : "1.5px solid var(--line)"};
        ${featured ? "box-shadow:0 18px 40px -18px rgba(95,102,240,.5)" : ""}">
        <span style="font-size:18px;font-weight:500;color:var(--muted)">${name}</span>
        <span style="font-size:44px;font-weight:700;letter-spacing:-.03em">${price}</span>
        <p style="font-size:17px;color:var(--muted);line-height:1.45;flex:1">${blurb}</p>
        <span style="padding:13px;border-radius:12px;text-align:center;font-size:17px;font-weight:500;
          ${featured ? "background:var(--brand);color:#fff" : "border:1.5px solid var(--line)"}">
          Choose ${name}</span></div>`,
      )
      .join("")}
  </div>
</div>`;

export const COLLABORATORS: Collaborator[] = [
  { id: "you", name: "You", initials: "K", color: "#5f66f0" },
  { id: "amara", name: "Amara Osei", initials: "AO", color: "#0f9d76", viewing: "chart-retention" },
  { id: "tomas", name: "Tomás Rivera", initials: "TR", color: "#d4761e", viewing: "page-landing" },
  { id: "jin", name: "Jin Park", initials: "JP", color: "#c2456d" },
];

export const SOURCES: WorkspaceSource[] = [
  { id: "s1", label: "revenue.xlsx", kind: "sheet", detail: "Summary, Cohorts, ARR" },
  { id: "s2", label: "board-update.gdoc", kind: "doc", detail: "Q3 narrative" },
  { id: "s3", label: "meridian.com", kind: "url", detail: "Live site, crawled today" },
  { id: "s4", label: "churn-analysis.csv", kind: "upload", detail: "2,300 rows" },
];

export const ARTIFACTS: Artifact[] = [
  {
    id: "slide-hook",
    title: "Opening hook",
    kind: "slide",
    aspect: 16 / 9,
    body: slidePitch,
    state: "ready",
    version: 4,
    updatedAt: "2026-08-25T09:12:00Z",
    updatedBy: "you",
    lastChange: "Tightened the headline to eight words",
  },
  {
    id: "chart-retention",
    title: "Retention by quarter",
    kind: "chart",
    aspect: 16 / 9,
    body: chartRevenue,
    state: "ready",
    version: 7,
    updatedAt: "2026-08-25T09:31:00Z",
    updatedBy: "amara",
    lastChange: "Pulled Q4 from revenue.xlsx",
  },
  {
    id: "page-landing",
    title: "Landing page",
    kind: "page",
    aspect: 16 / 10,
    body: pageLanding,
    state: "review",
    version: 2,
    updatedAt: "2026-08-25T08:54:00Z",
    updatedBy: "tomas",
    lastChange: "Added the collaboration badge",
  },
  {
    id: "diagram-loop",
    title: "Growth loop",
    kind: "diagram",
    aspect: 16 / 9,
    body: diagramFlywheel,
    state: "ready",
    version: 3,
    updatedAt: "2026-08-24T17:20:00Z",
    updatedBy: "jin",
  },
  {
    id: "doc-memo",
    title: "Raise memo",
    kind: "doc",
    aspect: 16 / 11,
    body: docMemo,
    state: "ready",
    version: 5,
    updatedAt: "2026-08-24T16:02:00Z",
    updatedBy: "you",
  },
  {
    id: "ui-pricing",
    title: "Pricing table",
    kind: "ui",
    aspect: 16 / 10,
    body: uiPricing,
    state: "ready",
    version: 1,
    updatedAt: "2026-08-24T14:41:00Z",
    updatedBy: "tomas",
  },
  {
    id: "email-recap",
    title: "Investor recap",
    kind: "email",
    aspect: 16 / 11,
    body: emailRecap,
    state: "ready",
    version: 2,
    updatedAt: "2026-08-24T11:15:00Z",
    updatedBy: "amara",
  },
];

export const HISTORY: HistoryEntry[] = [
  { id: "h7", at: "2026-08-25T09:31:00Z", actor: "amara", summary: "Pulled Q4 retention from revenue.xlsx", artifactIds: ["chart-retention"] },
  { id: "h6", at: "2026-08-25T09:12:00Z", actor: "you", summary: "Tightened the opening headline", artifactIds: ["slide-hook"] },
  { id: "h5", at: "2026-08-25T08:54:00Z", actor: "tomas", summary: "Added collaboration badge to the hero", artifactIds: ["page-landing"] },
  { id: "h4", at: "2026-08-24T17:20:00Z", actor: "jin", summary: "Rebuilt the growth loop as four stages", artifactIds: ["diagram-loop"] },
  { id: "h3", at: "2026-08-24T16:02:00Z", actor: "you", summary: "Drafted the raise memo from the board update", artifactIds: ["doc-memo"] },
  { id: "h2", at: "2026-08-24T14:41:00Z", actor: "tomas", summary: "Generated the pricing table", artifactIds: ["ui-pricing"] },
  { id: "h1", at: "2026-08-24T11:15:00Z", actor: "amara", summary: "Drafted the investor recap email", artifactIds: ["email-recap"] },
];

export const collaboratorById = (id: string): Collaborator =>
  COLLABORATORS.find((c) => c.id === id) ?? COLLABORATORS[0];

// ---------------------------------------------------------------- workspaces

export interface WorkspaceSummary {
  id: string;
  name: string;
  /** One-line description of what the team is making in here. */
  purpose: string;
  memberIds: string[];
  artifactCount: number;
  updatedAt: string;
  /** Artifacts shown stacked on the gallery card. */
  previewIds: string[];
  live?: boolean;
}

export const WORKSPACES: WorkspaceSummary[] = [
  {
    id: "meridian",
    name: "Meridian — Series B",
    purpose: "Raise narrative, deck, and the site refresh that goes with it",
    memberIds: ["you", "amara", "tomas", "jin"],
    artifactCount: 7,
    updatedAt: "2026-08-25T09:31:00Z",
    previewIds: ["slide-hook", "chart-retention", "page-landing"],
    live: true,
  },
  {
    id: "onboarding",
    name: "Onboarding redesign",
    purpose: "New activation flow, empty states, and the welcome email",
    memberIds: ["you", "jin"],
    artifactCount: 12,
    updatedAt: "2026-08-24T18:05:00Z",
    previewIds: ["ui-pricing", "email-recap", "doc-memo"],
  },
  {
    id: "q3-review",
    name: "Q3 business review",
    purpose: "Board pack, cohort analysis, and the exec summary",
    memberIds: ["you", "amara"],
    artifactCount: 9,
    updatedAt: "2026-08-22T15:40:00Z",
    previewIds: ["chart-retention", "doc-memo", "diagram-loop"],
  },
];

export const artifactById = (id: string): Artifact | undefined =>
  ARTIFACTS.find((a) => a.id === id);
