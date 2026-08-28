import type { Slide, SlideTemplate } from "./types";

/** One representative slide per template, for the styleguide. */
function make(
  template: SlideTemplate,
  title: string,
  blocks: Slide["blocks"],
  extra: Partial<Slide> = {},
): Slide {
  return {
    id: template,
    section_id: "sample",
    template,
    title,
    blocks,
    speaker_notes: "",
    image_prompt: "",
    image_url: "",
    image_rev: 0,
    approved: false,
    order: 0,
    ...extra,
  };
}

const b = (
  kind: Slide["blocks"][number]["kind"],
  text: string,
  value = "",
  source_ref = "",
) => ({ kind, text, value, source_ref });

export const SAMPLE_SLIDES: Slide[] = [
  make("hero", "A massive, underserved market", [
    b("text", "Legacy software leaves billions of enterprise value untapped."),
  ]),

  make("bullets", "Why customers standardise on us", [
    b("bullet", "Seamless integration from day one"),
    b("bullet", "Zero-friction rollout across teams"),
    b("bullet", "Predictable, compounding revenue"),
    b("bullet", "Support that answers in minutes"),
  ]),

  make("two_column", "The shift to modern infrastructure", [
    b("heading", "Legacy bottlenecks"),
    b("bullet", "Siloed data pipelines"),
    b("bullet", "Slow deployment cycles"),
    b("heading", "Our approach"),
    b("bullet", "Unified real-time engine"),
    b("bullet", "Instant zero-friction deploys"),
  ]),

  make("metrics", "The numbers behind the story", [
    b("metric", "Net revenue retention", "142%", "revenue.xlsx · Summary!B12"),
    b("metric", "Enterprise logos", "38", "crm-export · Accounts"),
    b("metric", "Gross margin", "81%", ""),
  ]),

  make("quote", "What customers tell us", [
    b("quote", "We replaced four tools with one and got our Fridays back."),
    b("text", "Dana Reyes, VP Platform at Continental"),
  ]),

  make("diagram", "The flywheel of cohort growth", [
    b("diagram_node", "Land a core team"),
    b("diagram_node", "Adjacent teams adopt"),
    b("diagram_node", "Expansion revenue"),
    b("diagram_node", "Reinvest in product"),
  ]),

  make("timeline", "Where the round takes us", [
    b("bullet", "Close design partners", "Q1"),
    b("bullet", "Ship self-serve tier", "Q2"),
    b("bullet", "Enterprise SSO + audit", "Q3"),
    b("bullet", "Series B readiness", "Q4"),
  ]),

  make(
    "image_full",
    "Built for the way teams actually work",
    [b("text", "One surface for the whole workflow.")],
    { image_prompt: "abstract architectural interior, soft light" },
  ),

  make("closing", "Let's talk next week", [
    b("text", "We are asking for a partner meeting to walk through the plan."),
  ]),
];
