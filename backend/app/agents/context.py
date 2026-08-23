"""Context agent (Phase 1, step 5): read connected Drive files and extract facts with sources."""
from pydantic import BaseModel

from ..google_apis import docs, drive, sheets
from ..schemas import SourceFact
from .runtime import make_agent, run_agent_json


class FactList(BaseModel):
    facts: list[SourceFact] = []


EXTRACT_INSTRUCTION = """You extract presentation-ready facts from raw document content.
Return the 10-30 most useful facts: metrics, dates, names, claims, comparisons.
Every fact MUST carry source_doc (the file name given) and source_ref (sheet range,
heading, or page hint found in the content). Never invent numbers.
Respond ONLY with JSON: {"facts": [{"fact": "...", "value": "...", "source_doc": "...", "source_ref": "..."}]}
"""


def _read_file_text(uid: str, file_id: str) -> tuple[str, str]:
    """Return (name, text_content) for a Drive file (Doc, Sheet, or plain/pdf export)."""
    meta = drive(uid).files().get(fileId=file_id, fields="name,mimeType").execute()
    name, mime = meta["name"], meta["mimeType"]

    if mime == "application/vnd.google-apps.document":
        doc = docs(uid).documents().get(documentId=file_id).execute()
        chunks = []
        for el in doc.get("body", {}).get("content", []):
            for pe in el.get("paragraph", {}).get("elements", []):
                chunks.append(pe.get("textRun", {}).get("content", ""))
        return name, "".join(chunks)

    if mime == "application/vnd.google-apps.spreadsheet":
        ss = sheets(uid).spreadsheets().get(spreadsheetId=file_id).execute()
        out = []
        for sh in ss.get("sheets", [])[:5]:
            title = sh["properties"]["title"]
            values = (sheets(uid).spreadsheets().values()
                      .get(spreadsheetId=file_id, range=f"'{title}'!A1:Z100").execute()
                      .get("values", []))
            rows = "\n".join(",".join(map(str, r)) for r in values)
            out.append(f"### sheet: {title}\n{rows}")
        return name, "\n\n".join(out)

    # Fallback: export as plain text where Drive supports it.
    try:
        data = drive(uid).files().export(fileId=file_id, mimeType="text/plain").execute()
        return name, data.decode("utf-8", errors="ignore")
    except Exception:  # noqa: BLE001
        return name, ""


async def extract_facts(uid: str, file_ids: list[str]) -> list[SourceFact]:
    corpus = []
    for fid in file_ids[:8]:
        name, text = _read_file_text(uid, fid)
        if text:
            corpus.append(f"===== FILE: {name} =====\n{text[:20000]}")
    if not corpus:
        return []
    agent = make_agent("context_extractor", EXTRACT_INSTRUCTION, output_schema=FactList)
    result = await run_agent_json(agent, uid, "\n\n".join(corpus), FactList)
    return result.facts
