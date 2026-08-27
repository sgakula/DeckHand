/**
 * A workspace is ONE thing being built — a deck, a page, a report — and it is
 * built inside a live audio session. People talk; the agent listens, decides
 * what the conversation implies, and edits the artifact on the shared screen.
 *
 * The script below drives a simulated session so the whole loop is visible
 * before any of it is wired to real audio.
 */

export type WorkspaceKind = "presentation" | "page" | "report" | "email" | "dashboard";

export const WORKSPACE_KIND_LABEL: Record<WorkspaceKind, string> = {
  presentation: "Presentation",
  page: "Landing page",
  report: "Report",
  email: "Email",
  dashboard: "Dashboard",
};

export interface Participant {
  id: string;
  name: string;
  initials: string;
  color: string;
  muted?: boolean;
  /** The person is not in the call, just watching. */
  listening?: boolean;
}

export interface Page {
  id: string;
  label: string;
  body: string;
}

export type ToolId = "gmail" | "drive" | "calendar" | "sheets" | "slides";

export interface Tool {
  id: ToolId;
  label: string;
  detail: string;
  connected: boolean;
}

export type FeedItem =
  | {
      kind: "speech";
      id: string;
      speakerId: string;
      text: string;
    }
  | {
      kind: "agent";
      id: string;
      /** What the agent did, in one line. */
      summary: string;
      pageId: string;
      /** A tool it reached for, if any. */
      tool?: ToolId;
    };

/** One scripted beat of the session. */
export interface SessionEvent {
  /** Milliseconds after the previous event. */
  after: number;
  item: FeedItem;
  /** Applied to the page the agent edited, if this beat changes the artifact. */
  patch?: { pageId: string; body: string };
}

export const PARTICIPANTS: Participant[] = [
  { id: "you", name: "You", initials: "K", color: "#7c86ff" },
  { id: "amara", name: "Amara Osei", initials: "AO", color: "#12b886" },
  { id: "tomas", name: "Tomás Rivera", initials: "TR", color: "#f08c3a" },
  { id: "jin", name: "Jin Park", initials: "JP", color: "#e0568a", listening: true },
];

export const TOOLS: Tool[] = [
  { id: "drive", label: "Drive", detail: "revenue.xlsx, board-update.gdoc", connected: true },
  { id: "sheets", label: "Sheets", detail: "Live cell reads", connected: true },
  { id: "gmail", label: "Gmail", detail: "Send recap and follow-ups", connected: true },
  { id: "calendar", label: "Calendar", detail: "Book the follow-up", connected: false },
  { id: "slides", label: "Slides", detail: "Export when you lock", connected: true },
];

// ------------------------------------------------------------------- pages

const heroV1 = `<div class="pad" style="justify-content:center;gap:22px">
  <span class="rule"></span>
  <h1 style="font-size:60px;line-height:1.08;letter-spacing:-.03em;font-weight:700;max-width:16ch">
    We help engineering teams ship software faster than before</h1>
  <p style="font-size:25px;line-height:1.45;color:var(--muted);max-width:34ch">
    A platform for modern development workflows.</p>
</div>`;

const heroV2 = `<div class="pad" style="justify-content:center;gap:22px">
  <span class="rule"></span>
  <h1 style="font-size:68px;line-height:1.06;letter-spacing:-.035em;font-weight:700;max-width:14ch">
    Every team ships <em>four times</em> slower than they think</h1>
  <p style="font-size:26px;line-height:1.45;color:var(--muted);max-width:34ch">
    We measured 2,300 releases. The bottleneck was never the code.</p>
</div>`;

const metricsV1 = `<div class="pad" style="gap:24px">
  <h2 style="font-size:38px;letter-spacing:-.02em;font-weight:700">Where we are</h2>
  <div style="flex:1;display:flex;gap:22px;align-items:stretch">
    ${[
      ["Net revenue retention", "142%"],
      ["Enterprise logos", "38"],
    ]
      .map(
        ([label, value]) => `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;
      gap:10px;padding:32px 26px;border-radius:18px;background:var(--tint)">
      <span style="font-size:72px;font-weight:700;letter-spacing:-.03em;color:var(--brand);line-height:1">${value}</span>
      <span style="font-size:21px;color:var(--muted)">${label}</span></div>`,
      )
      .join("")}
  </div>
</div>`;

const metricsV2 = `<div class="pad" style="gap:24px">
  <h2 style="font-size:38px;letter-spacing:-.02em;font-weight:700">Where we are</h2>
  <div style="flex:1;display:flex;gap:18px;align-items:stretch">
    ${[
      ["Net revenue retention", "142%", "revenue.xlsx · Summary!B12"],
      ["Enterprise logos", "38", "revenue.xlsx · Accounts"],
      ["Gross margin", "81%", "revenue.xlsx · P&L!D7"],
    ]
      .map(
        ([label, value, src]) => `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;
      gap:8px;padding:30px 22px;border-radius:18px;background:var(--tint)">
      <span style="font-size:58px;font-weight:700;letter-spacing:-.03em;color:var(--brand);line-height:1">${value}</span>
      <span style="font-size:19px;color:var(--muted);line-height:1.3">${label}</span>
      <span style="font-size:14px;color:var(--muted);opacity:.72;line-height:1.3">${src}</span></div>`,
      )
      .join("")}
  </div>
</div>`;

const askV1 = `<div class="pad" style="justify-content:center;align-items:center;text-align:center;gap:24px">
  <h1 style="font-size:62px;line-height:1.08;letter-spacing:-.03em;font-weight:700;max-width:16ch">
    We are raising <em>$18M</em> to scale go-to-market</h1>
  <p style="font-size:24px;color:var(--muted);max-width:40ch;line-height:1.45">
    Eighteen months of runway to triple the enterprise motion.</p>
  <span class="rule"></span>
</div>`;

const problemV1 = `<div class="pad" style="gap:26px">
  <h2 style="font-size:38px;letter-spacing:-.02em;font-weight:700">Why this keeps happening</h2>
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:20px">
    ${[
      "Work sits in review queues longer than it takes to write",
      "Every handoff loses the context that made the decision",
      "Nobody can see where the time actually went",
    ]
      .map(
        (t) => `<div style="display:flex;gap:18px;align-items:baseline;font-size:26px;line-height:1.4">
        <span style="flex:none;width:11px;height:11px;border-radius:50%;background:var(--brand);
          transform:translateY(-3px)"></span><span>${t}</span></div>`,
      )
      .join("")}
  </div>
</div>`;

export const INITIAL_PAGES: Page[] = [
  { id: "p1", label: "Hook", body: heroV1 },
  { id: "p2", label: "Problem", body: problemV1 },
  { id: "p3", label: "Traction", body: metricsV1 },
  { id: "p4", label: "The ask", body: askV1 },
];

// ------------------------------------------------------------------ script

export const SESSION_SCRIPT: SessionEvent[] = [
  {
    after: 1200,
    item: { kind: "speech", id: "e1", speakerId: "amara", text: "The opening is too soft. It reads like every other infra deck." },
  },
  {
    after: 3400,
    item: { kind: "speech", id: "e2", speakerId: "you", text: "Agreed. Lead with the number from the research — the four-times thing." },
  },
  {
    after: 2600,
    item: {
      kind: "agent",
      id: "e3",
      summary: "Rewrote the hook around the 4× finding and pulled the sample size from churn-analysis.csv",
      pageId: "p1",
      tool: "drive",
    },
    patch: { pageId: "p1", body: heroV2 },
  },
  {
    after: 3600,
    item: { kind: "speech", id: "e4", speakerId: "tomas", text: "On traction — Priya will ask about margin. Can we put it next to retention?" },
  },
  {
    after: 3000,
    item: { kind: "speech", id: "e5", speakerId: "amara", text: "And cite it. Last time we got caught without a source." },
  },
  {
    after: 2800,
    item: {
      kind: "agent",
      id: "e6",
      summary: "Added gross margin from revenue.xlsx and cited all three figures to their cells",
      pageId: "p3",
      tool: "sheets",
    },
    patch: { pageId: "p3", body: metricsV2 },
  },
  {
    after: 3800,
    item: { kind: "speech", id: "e7", speakerId: "you", text: "Good. Send Priya the cohort breakdown after this and book the follow-up." },
  },
  {
    after: 2400,
    item: {
      kind: "agent",
      id: "e8",
      summary: "Drafted the recap to Priya with the cohort file attached — waiting for you to send",
      pageId: "p3",
      tool: "gmail",
    },
  },
];
