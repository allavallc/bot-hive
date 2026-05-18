export const BOT_EVENT_KINDS = [
  "status",
  "question",
  "blocker",
  "handoff",
  "ready-for-review",
  "review-approved",
  "review-rejected",
  "ack",
] as const;

export type BotEventKind = (typeof BOT_EVENT_KINDS)[number];

export type ValidBotEventInput = {
  repoFullName?: string;
  colony: string;
  handle: string;
  kind: BotEventKind;
  message: string;
  targetHandle: string | null;
  targetRole: string | null;
  data: Record<string, unknown>;
};

export const MAX_BOT_EVENT_MESSAGE_CHARS = 2000;
export const MAX_BOT_EVENT_DATA_CHARS = 8000;

const EVENT_KIND_SET = new Set<string>(BOT_EVENT_KINDS);

function cleanOneLine(value: string): string {
  return value
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function optionalCleanString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const cleaned = cleanOneLine(value);
  return cleaned.length > 0 ? cleaned : null;
}

function cleanRequiredString(
  value: unknown,
  field: string,
):
  | { ok: true; value: string }
  | {
      ok: false;
      error: string;
    } {
  if (typeof value !== "string") return { ok: false, error: `${field} must be a string` };
  const cleaned = cleanOneLine(value);
  if (!cleaned) return { ok: false, error: `${field} is required` };
  return { ok: true, value: cleaned };
}

function dataObject(value: unknown):
  | { ok: true; value: Record<string, unknown> }
  | {
      ok: false;
      error: string;
    } {
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "data must be an object" };
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_BOT_EVENT_DATA_CHARS) {
    return { ok: false, error: `data exceeds ${MAX_BOT_EVENT_DATA_CHARS} chars` };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

export function roleMatches(candidateRole: string | null | undefined, targetRole: string): boolean {
  if (!candidateRole) return false;
  const normalized = targetRole.toLowerCase();
  return candidateRole
    .replace(/\s*\(.*?\)\s*/g, "")
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .includes(normalized);
}

export function validateBotEventInput(input: unknown):
  | { ok: true; value: ValidBotEventInput }
  | {
      ok: false;
      error: string;
    } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "body must be an object" };
  }
  const body = input as Record<string, unknown>;

  const colony = cleanRequiredString(body.colony, "colony");
  if (!colony.ok) return colony;

  const handle = cleanRequiredString(body.handle, "handle");
  if (!handle.ok) return handle;

  const kind = cleanRequiredString(body.kind, "kind");
  if (!kind.ok) return kind;
  if (!EVENT_KIND_SET.has(kind.value)) {
    return { ok: false, error: `kind must be one of ${BOT_EVENT_KINDS.join(", ")}` };
  }

  const message = cleanRequiredString(body.message, "message");
  if (!message.ok) return message;
  if (message.value.length > MAX_BOT_EVENT_MESSAGE_CHARS) {
    return { ok: false, error: `message exceeds ${MAX_BOT_EVENT_MESSAGE_CHARS} chars` };
  }

  const data = dataObject(body.data);
  if (!data.ok) return data;

  return {
    ok: true,
    value: {
      repoFullName: optionalCleanString(body.repoFullName) ?? undefined,
      colony: colony.value,
      handle: handle.value,
      kind: kind.value as BotEventKind,
      message: message.value,
      targetHandle: optionalCleanString(body.targetHandle),
      targetRole: optionalCleanString(body.targetRole),
      data: data.value,
    },
  };
}
