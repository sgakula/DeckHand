/**
 * The demo conversation.
 *
 * Three people, in order, no audio. You click a line and that person "says" it
 * into the real agent loop — every decision it makes is live, only the voices
 * are staged.
 *
 * Ordering rule for this script: the FIRST line must produce a visible edit.
 * A hold is the most interesting thing this agent does, but it only reads as
 * judgement once you have seen the thing work. Lead with capability, then show
 * restraint.
 */

export interface ScriptLine {
  n: number;
  speaker: string;
  text: string;
  /** What this line is here to demonstrate. Shown in the UI as a hint. */
  beat: string;
  /** What the agent should do. Shown so you can tell a miss from a surprise. */
  expect: "act" | "hold" | "ask" | "tool";
}

export const SPEAKERS: Record<string, string> = {
  You: "#7c86ff",
  Amara: "#12b886",
  Tomás: "#f08c3a",
};

export const SCRIPT: ScriptLine[] = [
  {
    n: 1,
    speaker: "Tomás",
    text: "Open with the four-times-slower stat — make that the headline on the hook slide.",
    beat: "A clear instruction. It acts.",
    expect: "act",
  },
  {
    n: 2,
    speaker: "Amara",
    text: "Pull our gross margin and retention from the revenue sheet onto the traction slide, and cite them.",
    beat: "Reaches for Drive, then cites every figure.",
    expect: "tool",
  },
  {
    n: 3,
    speaker: "You",
    text: "Hmm, the hook still feels a bit generic to me.",
    beat: "Criticism with no direction — it holds.",
    expect: "hold",
  },
  {
    n: 4,
    speaker: "Tomás",
    text: "On the ask slide I want the full use of funds broken out, line by line.",
    beat: "One side of a disagreement.",
    expect: "act",
  },
  {
    n: 5,
    speaker: "Amara",
    text: "No — keep the ask to a single line. A breakdown kills the close.",
    beat: "Now they conflict. It stops and asks.",
    expect: "ask",
  },
  {
    n: 6,
    speaker: "You",
    text: "I'll send Priya the cohort breakdown by Friday.",
    beat: "Captured as a commitment with an owner.",
    expect: "hold",
  },
];

/** Stable colour per speaker; unknown speakers get a neutral. */
export function speakerColor(name: string): string {
  return SPEAKERS[name] ?? "#8a8f98";
}
