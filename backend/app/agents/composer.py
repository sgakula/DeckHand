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
    #: A short new label (1-3 words) ONLY if the instruction changed the page's
    #: topic. Adding a visual or a figure does not change the topic.
    label: str = ""


# The renderer supplies this contract; the composer must stay inside it so every
# page in a workspace looks like it belongs to the same document.
STYLE_CONTRACT = """The page renders at 1400x788 (16:9). USE THESE CLASSES — they
already carry the sizing and colour, so you write almost no inline CSS. Every
inline style you can replace with a class makes the page land on the shared
screen sooner, and keeps the deck visually consistent.

  .pad      wrapper: padding + vertical flex column (always the outer div)
  .eyebrow  small uppercase brand label at the top of a page
  .rule     short accent bar under the eyebrow
  .h1       the headline (62px). .h2 for a secondary heading
  .support  the supporting line under a headline (25px, muted)
  .spacer   an empty <div class="spacer"></div> pushes what follows to the bottom
  .cards    a row of cards;  .card  one card  (.card.dark for one emphasised card)
  .label    card label (small caps) ·  .stat  the big number  (.stat.ink = dark)
  .note     small explanatory line inside a card
  .cite     the source line inside a card — ALWAYS use this for citations
  .owner    "Owner: <b>Name</b>" line ·  .row  a plain flex row
  <em>      brand-coloured (not italic) — wrap the sharpest phrase of a headline

For a full-bleed image page:
  <div class="pad onart"><img class="hero" src="URL"><div class="scrim"></div>
    <div class="over"> …eyebrow, h1, support… </div></div>

Only add an inline style for something genuinely one-off (a width, a gap).
Never restate what a class already sets. CSS vars if you need them:
var(--ink) var(--muted) var(--line) var(--tint) var(--brand)"""

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
- Use <h1 class="h1"> for the headline, with the sharpest phrase in <em>.
- Follow it with <p class="support"> — one line saying why the headline is true
  or what it implies.
- Never put more than six lines of text on one page.
- Any inline size must be px, not %: the canvas has a fixed logical size and
  percentage heights collapse without a definite parent.
- If the instruction supplies an image URL, use the full-bleed pattern from the
  style contract (.hero + .scrim + .over on a .pad.onart wrapper). Text must stay
  fully readable. Never show the URL as text.

Sourcing rules — these matter more than the visuals:
- You may only present a number as fact if it appears in CONNECTED FACTS. Copy its
  source_ref into the matching claim.
- If the group asks for a number you do not have, still place it, but leave that
  claim's source_ref empty. Do not invent a source.
- Declare EVERY number you put on the page in `claims`, sourced or not.
- Print each sourced figure's reference on the page itself with
  <div class="cite">source: revenue.xlsx · Summary!B12</div>. A visible citation
  is the point — the room asked for numbers an outsider can check.

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
    # Rendering, not reasoning: thinking here only delayed the page.
    agent = make_agent("composer", INSTRUCTION, output_schema=Composition,
                       thinking="off")
    prompt = (
        f"ARTIFACT KIND: {artifact_kind}\n"
        f"PAGE: {page_label}"
        f"{'  [EMPTY — this is placeholder text, replace it entirely]' if is_placeholder else ''}\n\n"
        f"CURRENT HTML:\n{current_html}\n\n"
        f"CONNECTED FACTS:\n{fact_list}\n\n"
        f"INSTRUCTION FROM THE GROUP:\n{instruction}"
    )
    return await run_agent_json(agent, uid, prompt, Composition)
