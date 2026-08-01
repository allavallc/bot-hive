// FS-028 / HV-130: seat → role consolidation.
//
// Parses the "Consolidation rule" table in `hive/roles.md` at module
// load and caches the result for the process lifetime. `hive/roles.md`
// remains the single source of truth — edit it to change the rule,
// then restart the server.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type RoleAssignment = {
  role: string;
  skillFiles: string[];
};

type ConsolidationRule = {
  // Row label from `hive/roles.md`: "1", "2", "3", or "4+".
  totalKey: string;
  // Per-seat role names in order (length = totalKey count, except for "4+"
  // where index 3 represents "4+" and any seat >= 4 reuses it).
  roleBySeat: string[];
};

const ROLES_MD_PATH = join(process.cwd(), "hive", "roles.md");

let cached: ConsolidationRule[] | null = null;

function parseConsolidationTable(markdown: string): ConsolidationRule[] {
  // Find the table that has "Active bots" in its header.
  const lines = markdown.split("\n");
  const headerIdx = lines.findIndex((l) => l.includes("Active bots") && l.includes("Bot 1"));
  if (headerIdx < 0) throw new Error("roles.md: 'Active bots' header row not found");

  const rules: ConsolidationRule[] = [];
  // Skip header (headerIdx) and separator (headerIdx+1).
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) break;
    const cells = line
      .split("|")
      .slice(1, -1) // drop the empty leading/trailing splits
      .map((c) => c.trim());
    if (cells.length < 2) continue;
    const totalKey = cells[0];
    const roleBySeat = cells.slice(1).filter((c) => c !== "—" && c !== "");
    if (roleBySeat.length === 0) continue;
    rules.push({ totalKey, roleBySeat });
  }
  if (rules.length === 0) throw new Error("roles.md: no consolidation rows parsed");
  return rules;
}

function loadRules(): ConsolidationRule[] {
  if (cached) return cached;
  const md = readFileSync(ROLES_MD_PATH, "utf-8");
  cached = parseConsolidationTable(md);
  return cached;
}

function skillFilesFor(role: string): string[] {
  // "PM + coder + tester" → ["pm", "coder", "tester"]
  // "coder (additional)" → ["coder"] (parenthetical hint is a label, not a role component)
  const components = role
    .replace(/\s*\(.*?\)\s*/g, "")
    .split("+")
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0);
  return components.map((c) => `hive/skills/${c}.md`);
}

function pickRule(rules: ConsolidationRule[], total: number): ConsolidationRule {
  // Exact match (totalKey "1", "2", "3"), or "4+" for larger colonies.
  const exact = rules.find((r) => r.totalKey === String(total));
  if (exact) return exact;
  const open = rules.find((r) => r.totalKey.endsWith("+"));
  if (!open) throw new Error(`roles.md: no rule covers total=${total}`);
  return open;
}

export function roleForSeat(total: number, position: number): RoleAssignment {
  if (total < 1 || position < 1 || position > total) {
    throw new Error(`invalid seat: total=${total}, position=${position}`);
  }

  const rule = pickRule(loadRules(), total);
  // For "4+" the table column for "Bot 4+" applies to position >= 4.
  const seatIdx = position - 1;
  const role =
    seatIdx < rule.roleBySeat.length
      ? rule.roleBySeat[seatIdx]
      : rule.roleBySeat[rule.roleBySeat.length - 1];

  return { role, skillFiles: skillFilesFor(role) };
}

// Test-only escape hatch: reset the cache so tests can swap in a fake
// roles.md if ever needed. Production callers do not use this.
export function _resetRolesCache(): void {
  cached = null;
}
