/**
 * Typed client for the Deckhand API.
 *
 * Auth: the backend accepts a Firebase ID token as `Authorization: Bearer`, but in
 * local dev it runs with DEV_FAKE_UID and ignores the header entirely, so the token
 * is optional throughout.
 */
import type {
  AnswerResult,
  BuildEvent,
  DeckVersion,
  DryRunResult,
  EditResult,
  InterviewReply,
  Job,
  Outline,
  PreferenceProfile,
  Presentation,
  Slide,
  SourceFact,
  Talk,
  UtteranceResult,
  VersionSummary,
  Workspace,
  WorkspaceKind,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? "http://localhost:8090";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Thrown when the request never completed — server down, or CORS blocked the reply. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

// Fire one throwaway request at the API origin as early as possible: even an
// edge-404 response carries Alt-Svc, which upgrades this origin to HTTP/3 for
// everything that follows. no-cors keeps it silent regardless of outcome.
let warmed = false;
function warmApiOrigin() {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  void fetch(`${API_BASE}/healthz`, { mode: "no-cors" }).catch(() => undefined);
}

function extractMessage(status: number, body: unknown): string {
  if (typeof body === "string" && body) return body;
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      const message = (detail as { message?: unknown }).message;
      if (typeof message === "string") return message;
      return JSON.stringify(detail);
    }
  }
  return `Request failed (${status})`;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: { signal?: AbortSignal },
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  } else if (typeof window !== "undefined") {
    // Invite-link guests: stable per-browser identity (see lib/identity.ts).
    const { guestId, guestName } = await import("@/lib/identity");
    const gid = guestId();
    if (gid) {
      headers["x-guest-id"] = gid;
      const name = guestName();
      if (name) headers["x-guest-name"] = name;
    }
  }

  warmApiOrigin();

  // Cloud Run edge quirk on fresh run.app hostnames: HTTP/1.1 requests can be
  // answered by Google's edge with a CORS-less HTML 404 (the browser surfaces
  // that as a NETWORK error, not a response), while HTTP/3 routes fine. Every
  // failed attempt still delivers the Alt-Svc header that teaches the browser
  // h3, so a few short retries ride straight through. Our own API never 404s
  // with HTML, so an HTML 404 is always the edge, not us.
  let res!: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: init?.signal,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      // Also covers FastAPI 500s, which carry no CORS headers and get blocked.
      throw new NetworkError(
        `Could not reach the Deckhand API at ${API_BASE}. It may be offline, or it ` +
          `returned a server error whose response was blocked by CORS — check the API logs.`,
      );
    }
    const ct = res.headers.get("content-type") ?? "";
    if (res.status === 404 && ct.includes("text/html") && attempt < 3) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    break;
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let parsed: unknown = text;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep the raw text */
    }
  }

  if (!res.ok) throw new ApiError(res.status, extractMessage(res.status, parsed), parsed);
  return parsed as T;
}

const get = <T,>(path: string, init?: { signal?: AbortSignal }) =>
  request<T>("GET", path, undefined, init);
const post = <T,>(path: string, body?: unknown) => request<T>("POST", path, body);
const put = <T,>(path: string, body?: unknown) => request<T>("PUT", path, body);

export const api = {
  health: () => get<{ ok: boolean }>("/healthz"),

  // ---- auth ----
  googleStatus: (init?: { signal?: AbortSignal }) =>
    get<{ connected: boolean }>("/auth/google/status", init),
  googleAuthUrl: () => get<{ auth_url: string }>("/auth/google/start"),

  // ---- presentations ----
  listPresentations: (init?: { signal?: AbortSignal }) =>
    get<Presentation[]>("/presentations", init),
  createPresentation: (title: string) => post<Presentation>("/presentations", { title }),
  getPresentation: (pid: string, init?: { signal?: AbortSignal }) =>
    get<Presentation>(`/presentations/${pid}`, init),
  setMembers: (pid: string, member_uids: string[]) =>
    post<Presentation>(`/presentations/${pid}/members`, { member_uids }),
  connectSources: (pid: string, file_ids: string[]) =>
    post<{ facts: SourceFact[] }>(`/presentations/${pid}/sources`, { file_ids }),

  // ---- interview ----
  sendInterviewMessage: (pid: string, text: string) =>
    post<InterviewReply>(`/presentations/${pid}/interview/message`, { text }),
  interviewHistory: (pid: string, init?: { signal?: AbortSignal }) =>
    get<BuildEvent[]>(`/presentations/${pid}/interview/history`, init),

  // ---- outline ----
  proposeOutline: (pid: string) => post<Outline>(`/presentations/${pid}/outline/propose`),
  updateOutline: (pid: string, outline: Outline) =>
    put<Outline>(`/presentations/${pid}/outline`, { outline }),
  approveOutline: (pid: string) => post<Outline>(`/presentations/${pid}/outline/approve`),

  // ---- deck ----
  getDeck: (pid: string, init?: { signal?: AbortSignal }) =>
    get<DeckVersion>(`/presentations/${pid}/deck`, init),
  buildSection: (pid: string, sectionId: string) =>
    post<{ version: number; slides: Slide[] }>(`/presentations/${pid}/deck/build/${sectionId}`),
  editSlide: (pid: string, slide_id: string, request_text: string, source = "text") =>
    post<EditResult>(`/presentations/${pid}/deck/edit`, { slide_id, request_text, source }),
  reorderSlides: (pid: string, slide_ids_in_order: string[]) =>
    post<{ ok: boolean }>(`/presentations/${pid}/deck/reorder`, { slide_ids_in_order }),
  approveSlide: (pid: string, slideId: string) =>
    post<{ ok: boolean }>(`/presentations/${pid}/deck/slides/${slideId}/approve`),
  dryRun: (pid: string, init?: { signal?: AbortSignal }) =>
    get<DryRunResult>(`/presentations/${pid}/deck/dry-run`, init),
  lockDeck: (pid: string) =>
    post<{ version: number; export_job: string }>(`/presentations/${pid}/deck/lock`),

  // ---- talks ----
  listTalks: (pid: string, init?: { signal?: AbortSignal }) =>
    get<Talk[]>(`/presentations/${pid}/talks`, init),
  startTalk: (pid: string) =>
    post<{ talk_id: string; version: number }>(`/presentations/${pid}/talks/start`),
  pushTranscript: (
    pid: string,
    tkid: string,
    chunk: { text: string; current_slide_id?: string; offset_seconds?: number },
  ) => post<{ new_notes: Talk["notes"] }>(`/presentations/${pid}/talks/${tkid}/transcript`, chunk),
  stopTalk: (pid: string, tkid: string) =>
    post<{ job_id: string }>(`/presentations/${pid}/talks/${tkid}/stop`),
  getTalk: (pid: string, tkid: string, init?: { signal?: AbortSignal }) =>
    get<Talk>(`/presentations/${pid}/talks/${tkid}`, init),

  // ---- feedback ----
  submitFeedback: (
    pid: string,
    version: number,
    items: { slide_id: string; rating: "up" | "down"; note: string }[],
  ) => post<{ job_id: string }>(`/presentations/${pid}/feedback`, { version, items }),
  getProfile: (pid: string, init?: { signal?: AbortSignal }) =>
    get<PreferenceProfile>(`/presentations/${pid}/feedback/profile`, init),

  // ---- versions ----
  listVersions: (pid: string, init?: { signal?: AbortSignal }) =>
    get<VersionSummary[]>(`/presentations/${pid}/versions`, init),
  getVersion: (pid: string, version: number) =>
    get<DeckVersion>(`/presentations/${pid}/versions/${version}`),
  diffVersions: (pid: string, a: number, b: number) =>
    get<{ added: string[]; removed: string[]; changed: string[] }>(
      `/presentations/${pid}/versions/${a}/diff/${b}`,
    ),
  revertVersion: (pid: string, version: number) =>
    post<DeckVersion>(`/presentations/${pid}/versions/${version}/revert`),
  branchVersion: (pid: string, version: number, instruction: string) =>
    post<{ job_id: string }>(`/presentations/${pid}/versions/${version}/branch`, { instruction }),

  // ---- live workspaces ----
  listWorkspaces: (init?: { signal?: AbortSignal }) =>
    get<Workspace[]>("/workspaces", init),
  createWorkspace: (title: string, kind: WorkspaceKind) =>
    post<Workspace>("/workspaces", { title, kind }),
  joinWorkspace: (wid: string) => post<Workspace>(`/workspaces/${wid}/join`),
  transcribeAudio: (wid: string, pcm_base64: string) =>
    post<{ text: string }>(`/workspaces/${wid}/transcribe`, { pcm_base64 }),
  getWorkspace: (wid: string, init?: { signal?: AbortSignal }) =>
    get<Workspace>(`/workspaces/${wid}`, init),
  /** One turn of the conversation. The agent decides act / hold / ask. */
  sendUtterance: (wid: string, speaker: string, text: string) =>
    post<UtteranceResult>(`/workspaces/${wid}/utterance`, { speaker, text }),
  /** Thumbs on an agent action; a note becomes a durable preference. */
  rateAction: (wid: string, event_id: string, rating: "up" | "down", note = "") =>
    post<{ ok: boolean; preferences: string[] }>(`/workspaces/${wid}/rate`, {
      event_id, rating, note,
    }),
  /** Accept or decline the agent's suggested next step. */
  resolveNextStep: (wid: string, accept: boolean) =>
    post<UtteranceResult>(`/workspaces/${wid}/next-step`, { accept }),
  /** Resolve the single question the agent is blocked on. */
  answerQuestion: (wid: string, choice: string) =>
    post<AnswerResult>(`/workspaces/${wid}/answer`, { choice }),

  // ---- jobs & activity ----
  getJob: (jobId: string, init?: { signal?: AbortSignal }) =>
    get<Job>(`/jobs/${jobId}`, init),
  activity: (pid: string, init?: { signal?: AbortSignal }) =>
    get<BuildEvent[]>(`/presentations/${pid}/activity`, init),
};

/** WebSocket URL for the Gemini Live broker (audio in, transcript/notes out). */
export function liveSocketUrl(path: string): string {
  if (API_BASE.startsWith("http")) return `${API_BASE.replace(/^http/, "ws")}${path}`;
  // Relative API base (same-origin proxy): derive the socket URL from the page.
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${API_BASE}${path}`;
}
