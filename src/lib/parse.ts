export type ParsedTicket = {
  hvId: string;
  title: string;
  frontmatter: Record<string, string>;
  body: string;
};

export type ParsedFeatureSet = {
  title: string;
  body: string;
};

const FRONTMATTER_RE = /^- \*\*([^*]+)\*\*:\s*(.*)$/;
const HV_ID_RE = /\[(HV-\d+)\]/;

export function parseTicket(content: string): ParsedTicket {
  const lines = content.split(/\r?\n/);
  const titleIdx = lines.findIndex((l) => l.startsWith("# "));
  if (titleIdx < 0) {
    throw new Error("No `# [HV-XXX] Title` heading found");
  }
  const titleLine = lines[titleIdx];
  const idMatch = HV_ID_RE.exec(titleLine);
  if (!idMatch) {
    throw new Error(`No [HV-XXX] id in heading: "${titleLine}"`);
  }
  const hvId = idMatch[1];
  const title = titleLine
    .replace(/^# /, "")
    .replace(/^\[HV-\d+\]\s*/, "")
    .trim();

  const frontmatter: Record<string, string> = {};
  let bodyStart = lines.length;
  for (let i = titleIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const m = FRONTMATTER_RE.exec(line);
    if (m) {
      frontmatter[m[1].trim()] = m[2].trim();
      continue;
    }
    bodyStart = i;
    break;
  }

  const body = lines.slice(bodyStart).join("\n").trim();
  return { hvId, title, frontmatter, body };
}

export function parseFeatureSet(content: string): ParsedFeatureSet {
  const lines = content.split(/\r?\n/);
  const titleIdx = lines.findIndex((l) => l.startsWith("# "));
  if (titleIdx < 0) {
    throw new Error("No `# Title` heading found");
  }
  const title = lines[titleIdx]
    .replace(/^# /, "")
    .replace(/^\[[^\]]+\]\s*/, "")
    .trim();
  const body = lines
    .slice(titleIdx + 1)
    .join("\n")
    .trim();
  return { title, body };
}
