/** Mirrors backend/app/schemas.py. Keep field names identical to the API. */

export type SlideTemplate =
  | "hero"
  | "bullets"
  | "two_column"
  | "metrics"
  | "quote"
  | "diagram"
  | "timeline"
  | "image_full"
  | "closing";

export type BlockKind =
  | "heading"
  | "text"
  | "bullet"
  | "metric"
  | "quote"
  | "image"
  | "diagram_node";

export interface SlideBlock {
  kind: BlockKind;
  text: string;
  value: string;
  /** Provenance for numbers. Empty string means the claim is UNSOURCED. */
  source_ref: string;
}

export interface Slide {
  id: string;
  section_id: string;
  template: SlideTemplate;
  title: string;
  blocks: SlideBlock[];
  speaker_notes: string;
  image_prompt: string;
  image_url: string;
  image_rev: number;
  approved: boolean;
  order: number;
}

export interface DeckVersion {
  version: number;
  slides: Slide[];
  locked: boolean;
  locked_at: string | null;
  parent_version: number | null;
  branch_label: string;
  created_at: string;
  slides_file_id: string;
  pdf_url: string;
  pptx_url: string;
}

export interface VersionSummary {
  version: number;
  locked: boolean;
  created_at: string;
  branch_label: string;
  parent_version: number | null;
  slides: number;
  slides_file_id: string;
}

export interface SourceFact {
  fact: string;
  value: string;
  source_doc: string;
  source_ref: string;
}

export interface OutlineSection {
  id: string;
  title: string;
  key_claim: string;
  supporting_facts: SourceFact[];
  est_minutes: number;
  order: number;
}

export interface Outline {
  sections: OutlineSection[];
  approved: boolean;
  approved_at: string | null;
}

export interface PresentationBrief {
  audience: string;
  duration_minutes: number;
  desired_outcome: string;
  must_include: string[];
  must_avoid: string[];
  tone: string;
  attendee_emails: string[];
  complete: boolean;
}

export interface Presentation {
  id: string;
  owner_uid: string;
  title: string;
  member_uids: string[];
  brief: PresentationBrief;
  outline: Outline;
  source_file_ids: string[];
  facts: SourceFact[];
  current_version: number;
  created_at: string;
}

export type NoteKind =
  | "skipped_section"
  | "rushed_section"
  | "unsourced_claim"
  | "number_mismatch"
  | "audience_question"
  | "commitment"
  | "objection";

export interface TalkNote {
  kind: NoteKind;
  text: string;
  slide_id: string;
  answered: boolean | null;
  at_seconds: number;
}

export interface Talk {
  id: string;
  presentation_id: string;
  version: number;
  status: "live" | "stopped" | "processed";
  started_at: string;
  stopped_at: string | null;
  transcript: string[];
  notes: TalkNote[];
}

export interface PreferenceProfile {
  known_answers: Record<string, string>;
  structure_prefs: string[];
  style_prefs: string[];
  density_prefs: string[];
  recurring_questions: string[];
  updated_at: string;
}

export type JobType = "post_talk" | "export_deck" | "branch_deck" | "feedback_update";

export interface Job {
  id: string;
  type: JobType;
  uid: string;
  presentation_id: string;
  version: number;
  talk_id: string;
  payload: Record<string, unknown>;
  status: "queued" | "running" | "done" | "error";
  steps_done: string[];
  error: string;
  created_at: string;
}

export interface BuildEvent {
  channel?: "interview" | "outline" | "builder";
  role?: "user" | "agent";
  kind?: string;
  uid?: string;
  text?: string;
  slide_id?: string;
  request?: string;
  change?: string;
  source?: string;
  at?: string;
}

export type ProblemKind =
  | "missing_section"
  | "unsourced_claim"
  | "overtime";

export interface DryRunProblem {
  kind: ProblemKind;
  /** Section id or slide id the problem points at; empty for deck-wide problems. */
  ref: string;
  detail: string;
}

/** GET /presentations/{pid}/deck/dry-run */
export interface DryRunResult {
  problems: DryRunProblem[];
  unapproved_slides: string[];
  ready: boolean;
}

export interface InterviewReply {
  reply: string;
  brief: PresentationBrief;
  complete: boolean;
}

export interface EditResult {
  slide?: Slide;
  change_summary?: string;
  clarifying_question?: string;
}
