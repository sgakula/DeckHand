/**
 * The demo meeting: a go/no-go launch review.
 *
 * Four people, four kinds of expertise — product (You), engineering (Amara),
 * sales (Tomás), marketing (Jules) — deciding whether "Autopilot" ships, and
 * leaving with the launch brief built. The workspace starts as ONE empty page;
 * every page that exists at the end was created by the agent because the
 * conversation opened that topic. Press Play: every decision, tool run and
 * composed page is live. Only the voices are staged.
 */

export interface ScriptLine {
  n: number;
  speaker: string;
  text: string;
  /** What this line is here to demonstrate. Shown in the UI as a hint. */
  beat: string;
  /** What the agent should do. Shown so you can tell a miss from a surprise. */
  expect: "act" | "hold" | "ask" | "tool" | "image";
}

/** Shown as the workspace title for a fresh session. */
export const SESSION_TITLE = "Autopilot — launch decision";

export const SPEAKERS: Record<string, string> = {
  You: "#7c86ff",
  Amara: "#12b886",
  Tomás: "#f08c3a",
  Jules: "#e64980",
};

export const SCRIPT: ScriptLine[] = [
  {
    n: 1,
    speaker: "You",
    text: "Alright — go or no-go on the Autopilot launch, and we leave this call with the brief. Start a positioning page: Autopilot closes the loop from alert to fix, with no human in the middle at three a.m.",
    beat: "Product frames it — the agent creates the first page.",
    expect: "act",
  },
  {
    n: 2,
    speaker: "Amara",
    text: "Ground it in the beta before we sell anything. Pull the beta metrics sheet from Drive — adoption, the time-to-resolution delta, sev-one regressions — onto an evidence page, and cite the cells.",
    beat: "Engineering wants proof — real workbook, real cell refs, new page.",
    expect: "tool",
  },
  {
    n: 3,
    speaker: "Tomás",
    text: "Deals stall on price every single time. Search what Datadog and PagerDuty charge for their automation add-ons today, and set up a pricing page that positions us against them.",
    beat: "Sales brings the market — live Google Search, cited.",
    expect: "tool",
  },
  {
    n: 4,
    speaker: "Jules",
    text: "The positioning page needs a hero visual — a calm ops floor at night, everything green, one operator sipping coffee. Premium, not cartoonish.",
    beat: "Marketing art-directs — a real image lands behind the headline.",
    expect: "image",
  },
  {
    n: 5,
    speaker: "You",
    text: "Hmm — the evidence page still feels thin to me.",
    beat: "Criticism with no direction — it waits.",
    expect: "hold",
  },
  {
    n: 6,
    speaker: "Amara",
    text: "Because the story is durability, not speed. Add the beta cohort retention curve from the cohorts file and cite it — month twelve is the number that converts skeptics.",
    beat: "Engineering supplies the direction — second real file.",
    expect: "tool",
  },
  {
    n: 7,
    speaker: "Tomás",
    text: "Price it at forty-nine per host per month. Clean number, lands under Datadog, no procurement committee needed.",
    beat: "Sales anchors low. It applies it…",
    expect: "act",
  },
  {
    n: 8,
    speaker: "Jules",
    text: "Absolutely not — forty-nine anchors us as a budget tool. Ninety-nine with an annual discount, or usage-based. The premium story dies at forty-nine.",
    beat: "…marketing rejects it. Two experts, two prices — it stops and asks.",
    expect: "ask",
  },
  {
    n: 9,
    speaker: "You",
    text: "Amara, what actually keeps you up at night about shipping this?",
    beat: "A question to a person, not the agent — it stays out of the way.",
    expect: "hold",
  },
  {
    n: 10,
    speaker: "Amara",
    text: "Two things. Auto-actions inside regulated accounts need an explicit approval mode — that one's mine. And the rollback path has never been load-tested — that's on Tomás's team with staging. Put both on a risks page with owners.",
    beat: "A risks page is born, each risk with its owner in the notes.",
    expect: "act",
  },
  {
    n: 11,
    speaker: "Jules",
    text: "Draft the beta-customer announcement email now — warm, two short paragraphs, and lead with the resolution number. And a rule for everything we make: the number is the headline, never an adjective.",
    beat: "A real .eml draft — and a durable preference it will keep.",
    expect: "tool",
  },
  {
    n: 12,
    speaker: "Tomás",
    text: "Hold Thursday two p.m. for pricing sign-off with finance — the four of us, thirty minutes.",
    beat: "A real calendar hold (.ics) lands in the feed.",
    expect: "tool",
  },
  {
    n: 13,
    speaker: "You",
    text: "Good meeting. Export the brief — I'm walking the exec team through it tonight.",
    beat: "A real .pptx of everything the room just built.",
    expect: "tool",
  },
];

/** Stable colour per speaker; unknown speakers get a neutral. */
export function speakerColor(name: string): string {
  return SPEAKERS[name] ?? "#8a8f98";
}

/**
 * How far through the script the room is, derived from the server transcript so
 * a reload resumes in the right place. Matches leading script lines in order and
 * skips everything else (answers to questions, accepted suggestions, mic input).
 */
export function scriptProgress(transcript: { speaker: string; text: string }[]): number {
  let i = 0;
  for (const t of transcript) {
    if (i < SCRIPT.length && t.speaker === SCRIPT[i].speaker && t.text === SCRIPT[i].text) {
      i += 1;
    }
  }
  return i;
}
