"""The composer: turns an agreed instruction into the rendered page.

It emits HTML because HTML is the one visual medium a language model is genuinely
fluent in — but nobody in the product ever sees it. The page is rendered in a
sandboxed frame and the group only ever discusses the rendered thing.

Every numeric claim comes back declared, with the source it came from. Claims
with no source are surfaced on screen rather than quietly presented as fact.
"""
from pydantic import BaseModel, Field

from ..schemas import SourceFact
from .runtime import make_agent, run_agent_json


class Claim(BaseModel):
    text: str
    value: str = ""
    #: Empty means the composer could not tie this to a connected source.
    source_ref: str = ""


class Composition(BaseModel):
    html: str
    #: Every number or hard factual assertion placed on the page.
    claims: list[Claim] = Field(default_factory=list)
    #: A short new label if the instruction changed what the page is about.
    label: str = ""


# The renderer supplies this contract; the composer must stay inside it so every
# page in a workspace looks like it belongs to the same document.
STYLE_CONTRACT = """The page is rendered at 1400x788 (16:9) with this available:
- Wrapper: <div class="pad"> gives padding and a vertical flex column.
- .eyebrow  — small uppercase brand-coloured label
- .rule     — a short accent bar used as a visual anchor
- <em>      — renders in the brand accent colour, NOT italic. Use it to make one
              phrase in a headline pop.
- CSS vars: var(--ink) var(--muted) var(--line) var(--tint) var(--brand)
Inline styles are expected for everything else."""

INSTRUCTION = f"""You compose one page of a live artifact. You are given the page
as it stands and one instruction agreed by the group. Return the FULL new HTML
body for that page.

{STYLE_CONTRACT}

Composition rules:
- If the page is marked EMPTY, the current HTML is a placeholder. Ignore it
  completely and compose the page from scratch. Never carry placeholder wording
  ("the one line that makes them lean in", "start talking") into real output.
- Otherwise change only what the instruction asks for and keep everything else
  recognisable. This is a live shared screen; gratuitous change is disorienting.
- A page is never just a fragment. Every page you return has, at minimum, a
  headline AND one supporting line. If the instruction gives you only a phrase
  ("the four-times-slower stat"), write the full claim around it.
- A headline is a COMPLETE STATEMENT a person would say out loud, 6-12 words.
  "Four times slower" is a fragment and is not acceptable. "Every team ships
  four times slower than they think" is a headline.
- Use a real <h1> for the headline: font-size 54-70px, line-height ~1.08,
  letter-spacing -.03em, font-weight 700. Wrap the sharpest phrase in <em>.
- Follow it with one supporting line: 22-28px, color var(--muted), max-width
  ~34ch, that says why the headline is true or what it implies.
- Never put more than six lines of text on one page.
- Sizes must be px, not %, because the canvas has a fixed logical size and
  percentage heights collapse without a definite parent.

Sourcing rules — these matter more than the visuals:
- You may only present a number as fact if it appears in CONNECTED FACTS. Copy its
  source_ref into the matching claim.
- If the group asks for a number you do not have, still place it, but leave that
  claim's source_ref empty. Do not invent a source.
- Declare EVERY number you put on the page in `claims`, sourced or not.

Respond ONLY with JSON matching the Composition schema.
"""


async def compose(
    uid: str,
    page_label: str,
    current_html: str,
    instruction: str,
    facts: list[SourceFact],
    artifact_kind: str,
    is_placeholder: bool = False,
) -> Composition:
    fact_list = (
        "\n".join(f"- {f.fact} = {f.value}  (source_ref: {f.source_ref})" for f in facts)
        or "(no sources connected — every number you place will be flagged)"
    )
    agent = make_agent("composer", INSTRUCTION, output_schema=Composition)
    prompt = (
        f"ARTIFACT KIND: {artifact_kind}\n"
        f"PAGE: {page_label}"
        f"{'  [EMPTY — this is placeholder text, replace it entirely]' if is_placeholder else ''}\n\n"
        f"CURRENT HTML:\n{current_html}\n\n"
        f"CONNECTED FACTS:\n{fact_list}\n\n"
        f"INSTRUCTION FROM THE GROUP:\n{instruction}"
    )
    return await run_agent_json(agent, uid, prompt, Composition)
