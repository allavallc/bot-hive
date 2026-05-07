// Pure helpers for the human ↔ bot notes channel (FS-015 v1).
// Extracted from src/app/api/projects/[id]/notes/route.ts so they can be
// unit-tested without standing up the full Next.js route + GitHub App
// mocks. The route module imports these and keeps only its I/O concerns.

export const MAX_MESSAGE_CHARS = 280;
export const MAX_LINES_BEFORE_TRIM = 1000;
export const KEEP_AFTER_TRIM = 500;

// Map a free-form actor name (display name, email, github login) to a
// filename-safe slug. Always non-empty — falls back to "anon".
export function actorSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "anon"
  );
}

// Append a single line and return the resulting file body. When the
// resulting file would exceed MAX_LINES_BEFORE_TRIM lines, the oldest
// lines are dropped so KEEP_AFTER_TRIM lines remain. Trailing newline
// always present so concatenation stays clean.
export function appendAndTrim(existing: string, line: string): string {
  const trimmed = existing.trimEnd();
  const lines = trimmed ? trimmed.split("\n") : [];
  lines.push(line);
  if (lines.length > MAX_LINES_BEFORE_TRIM) {
    return `${lines.slice(lines.length - KEEP_AFTER_TRIM).join("\n")}\n`;
  }
  return `${lines.join("\n")}\n`;
}

// Server-side validation for the message body. Returns the cleaned
// message or an error string. The route handler maps the error to a 400.
//
// - Tabs and newlines are stripped (TSV format requires them as
//   structural delimiters; treating them as part of the message would
//   corrupt the file).
// - Empty (after trim) is rejected.
// - Over MAX_MESSAGE_CHARS is rejected.
export function validateMessage(
  raw: unknown,
): { ok: true; message: string } | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: "message must be a string" };
  }
  const cleaned = raw.replace(/[\t\r\n]+/g, " ").trim();
  if (!cleaned) {
    return { ok: false, error: "empty message" };
  }
  if (cleaned.length > MAX_MESSAGE_CHARS) {
    return { ok: false, error: `message exceeds ${MAX_MESSAGE_CHARS} chars` };
  }
  return { ok: true, message: cleaned };
}
