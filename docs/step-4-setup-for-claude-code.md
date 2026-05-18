# Step 4 Setup: Evals on Agent Behavior (LLM Agnostic)

## What you are building

An eval script that checks whether any agent followed its process after a session ends.
The rules engine is shared. The only thing that changes per agent is a small adapter file.

Swapping agents = changing one import line.

---

## The Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        AGENT SESSION                         │
│                                                             │
│   Agent runs → writes files, runs bash, reads files         │
│   Every action logged to transcript on disk                 │
└─────────────────────────┬───────────────────────────────────┘
                          │ session ends
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     TRIGGER                                  │
│                                                             │
│   Claude Code:  Stop hook fires eval-session.js             │
│   Codex CLI:    PostExec hook or run manually               │
│   Cursor:       run manually after session                  │
│   Aider:        run manually after session                  │
│   Any agent:    node scripts/eval-session.js                │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     ADAPTER LAYER                            │
│                                                             │
│   scripts/adapters/claude-code.js  ← implemented            │
│   scripts/adapters/codex.js        ← implemented            │
│   scripts/adapters/cursor.js       ← placeholder            │
│   scripts/adapters/aider.js        ← placeholder            │
│   scripts/adapters/manual.js       ← fallback for anything  │
│                                                             │
│   Every adapter exports the same two functions:             │
│     getLatestTranscript(projectRoot) → path or null         │
│     adapt(transcriptPath) → normalized calls array          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     RULES ENGINE                             │
│                                                             │
│   Receives normalized calls — does not know which agent ran │
│                                                             │
│   rule: schema-change-requires-doc-read                     │
│   rule: tsc-must-run-before-done                            │
│   rule: vitest-must-run-before-done                         │
│   rule: (add more as patterns emerge from outcome log)      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     OUTPUT                                   │
│                                                             │
│   ALWAYS:  append row to hive/outcomes/current.md           │
│   IF FAIL: write hive/outcomes/LAST-EVAL-FAILED.md          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  NEXT SESSION START                          │
│                                                             │
│   Agent checks for LAST-EVAL-FAILED.md                      │
│   If exists → tells you what failed → deletes the file      │
└─────────────────────────────────────────────────────────────┘
```

---

## The Adapter Interface

Every adapter must implement exactly these two functions.
Nothing else. The rules engine only ever sees the normalized output.

```javascript
// REQUIRED: find the most recent transcript for this project
// returns: absolute path string, or null if not found
function getLatestTranscript(projectRoot) { ... }

// REQUIRED: convert native transcript to normalized calls
// returns: array of { tool, path?, command? }
function adapt(transcriptPath) { ... }

// Normalized call shape:
// {
//   tool: "read" | "write" | "bash" | "other",
//   path: string | undefined,
//   command: string | undefined
// }

module.exports = { getLatestTranscript, adapt };
```

---

## Folder Structure

```
scripts/
  eval-session.js           ← main entry point
  adapters/
    claude-code.js          ← implemented
    codex.js                ← implemented
    cursor.js               ← placeholder
    aider.js                ← placeholder
    manual.js               ← fallback
  rules/
    index.js                ← all rules, never mentions any agent
```

---

## Instructions

### 1. Create the rules engine

`scripts/rules/index.js`

```javascript
const rules = [
  {
    name: "schema-change-requires-doc-read",
    check: (calls) => {
      const schemaWrite = calls.find(c =>
        c.tool === "write" && c.path?.match(/schema|migration|drizzle/i)
      );
      if (!schemaWrite) return { pass: true };
      const mdRead = calls.find(c =>
        c.tool === "read" && c.path?.endsWith(".md")
      );
      return mdRead
        ? { pass: true }
        : { pass: false, reason: "schema file changed but no .md files were read" };
    }
  },
  {
    name: "tsc-must-run-before-done",
    check: (calls) => {
      const ran = calls.find(c =>
        c.tool === "bash" && c.command?.includes("tsc --noEmit")
      );
      return ran
        ? { pass: true }
        : { pass: false, reason: "tsc --noEmit was not run" };
    }
  },
  {
    name: "vitest-must-run-before-done",
    check: (calls) => {
      const ran = calls.find(c =>
        c.tool === "bash" && c.command?.includes("vitest")
      );
      return ran
        ? { pass: true }
        : { pass: false, reason: "vitest was not run" };
    }
  }
];

function runRules(calls) {
  const failures = rules
    .map(r => ({ name: r.name, ...r.check(calls) }))
    .filter(r => !r.pass);
  return { pass: failures.length === 0, failures };
}

module.exports = { runRules };
```

---

### 2. Create the Claude Code adapter

`scripts/adapters/claude-code.js`

```javascript
const fs = require("fs");
const path = require("path");
const os = require("os");

function getLatestTranscript(projectRoot) {
  const claudeDir = path.join(os.homedir(), ".claude", "projects");
  if (!fs.existsSync(claudeDir)) return null;

  let latest = null;
  let latestTime = 0;

  for (const folder of fs.readdirSync(claudeDir)) {
    const folderPath = path.join(claudeDir, folder);
    for (const f of fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"))) {
      const fp = path.join(folderPath, f);
      const mtime = fs.statSync(fp).mtimeMs;
      if (mtime > latestTime) { latestTime = mtime; latest = fp; }
    }
  }

  return latest;
}

function adapt(transcriptPath) {
  return fs.readFileSync(transcriptPath, "utf8")
    .split("\n").filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(l => l?.type === "tool_use")
    .map(l => ({
      tool: l.name?.toLowerCase() === "read"  ? "read"
          : l.name?.toLowerCase() === "write" ? "write"
          : l.name?.toLowerCase() === "bash"  ? "bash"
          : "other",
      path:    l.input?.file_path || l.input?.path,
      command: l.input?.command
    }));
}

module.exports = { getLatestTranscript, adapt };
```

---

### 3. Create the Codex adapter

`scripts/adapters/codex.js`

Codex CLI stores session logs under `~/.codex/sessions/` as JSONL.
Each line is a message. Tool calls are assistant messages with `type: "function"` blocks.

```javascript
const fs = require("fs");
const path = require("path");
const os = require("os");

function getLatestTranscript(projectRoot) {
  const codexDir = path.join(os.homedir(), ".codex", "sessions");
  if (!fs.existsSync(codexDir)) return null;

  const files = fs.readdirSync(codexDir)
    .filter(f => f.endsWith(".jsonl"))
    .map(f => ({ fp: path.join(codexDir, f), mtime: fs.statSync(path.join(codexDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  return files.length > 0 ? files[0].fp : null;
}

function adapt(transcriptPath) {
  const lines = fs.readFileSync(transcriptPath, "utf8")
    .split("\n").filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(l => l?.role === "assistant");

  const calls = [];

  for (const line of lines) {
    const content = Array.isArray(line.content) ? line.content : [line.content];
    for (const block of content) {
      if (block?.type !== "function") continue;
      const name = block.name?.toLowerCase() || "";
      let args = {};
      try { args = JSON.parse(block.arguments || "{}"); } catch { /* skip */ }

      if (name.includes("read") || name === "view") {
        calls.push({ tool: "read", path: args.path || args.file_path });
      } else if (name.includes("write") || name === "create") {
        calls.push({ tool: "write", path: args.path || args.file_path });
      } else if (name === "shell" || name === "exec" || name.includes("bash")) {
        calls.push({ tool: "bash", command: args.command || args.cmd });
      } else {
        calls.push({ tool: "other" });
      }
    }
  }

  return calls;
}

module.exports = { getLatestTranscript, adapt };
```

> **Note:** After a Codex session run:
> `cat $(ls -t ~/.codex/sessions/*.jsonl | head -1)`
> Confirm the structure matches and adjust if needed.

---

### 4. Create the Cursor placeholder

`scripts/adapters/cursor.js`

```javascript
// PLACEHOLDER — Cursor adapter not yet implemented
//
// Cursor stores session logs at:
//   macOS:   ~/Library/Application Support/Cursor/logs/
//   Windows: %APPDATA%\Cursor\logs\
//
// Inspect the folder after a session to find the format,
// then implement getLatestTranscript() and adapt() below.
//
// Must match the interface:
//   getLatestTranscript(projectRoot) → path or null
//   adapt(transcriptPath) → [{ tool, path?, command? }]

function getLatestTranscript(projectRoot) {
  throw new Error("Cursor adapter not yet implemented");
}

function adapt(transcriptPath) {
  throw new Error("Cursor adapter not yet implemented");
}

module.exports = { getLatestTranscript, adapt };
```

---

### 5. Create the Aider placeholder

`scripts/adapters/aider.js`

```javascript
// PLACEHOLDER — Aider adapter not yet implemented
//
// Aider writes its chat history to the project root:
//   .aider.chat.history.md
//
// The file is plain markdown — not structured JSON.
// Tool calls are embedded as text in assistant turns.
// Parsing strategy: scan assistant turns for file paths
// and shell commands in code blocks.
//
// getLatestTranscript() is already implemented below
// since the path is predictable. Only adapt() needs work.

const fs = require("fs");
const path = require("path");

function getLatestTranscript(projectRoot) {
  const p = path.join(projectRoot, ".aider.chat.history.md");
  return fs.existsSync(p) ? p : null;
}

function adapt(transcriptPath) {
  throw new Error("Aider adapt() not yet implemented — see comments above");
}

module.exports = { getLatestTranscript, adapt };
```

---

### 6. Create the manual fallback adapter

`scripts/adapters/manual.js`

Use this for any agent that has no hook and no parseable log.
After a session, write a plain text file at `hive/outcomes/last-session.txt`
with one line per action, then run the eval script.

```javascript
// Format of hive/outcomes/last-session.txt:
//   read: src/schema.ts
//   write: src/schema.ts
//   bash: npx tsc --noEmit
//   bash: npx vitest run
//   read: hive/bot-startup.md

const fs = require("fs");
const path = require("path");

function getLatestTranscript(projectRoot) {
  const p = path.join(projectRoot, "hive", "outcomes", "last-session.txt");
  return fs.existsSync(p) ? p : null;
}

function adapt(transcriptPath) {
  return fs.readFileSync(transcriptPath, "utf8")
    .split("\n").filter(Boolean)
    .map(line => {
      const [toolRaw, ...rest] = line.split(": ");
      const value = rest.join(": ").trim();
      const tool = toolRaw.trim().toLowerCase();
      if (tool === "read")  return { tool: "read",  path: value };
      if (tool === "write") return { tool: "write", path: value };
      if (tool === "bash")  return { tool: "bash",  command: value };
      return { tool: "other" };
    });
}

module.exports = { getLatestTranscript, adapt };
```

---

### 7. Create the main eval script

`scripts/eval-session.js`

```javascript
const fs = require("fs");
const path = require("path");
const { runRules } = require("./rules/index");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTCOMES_FILE = path.join(PROJECT_ROOT, "hive", "outcomes", "current.md");
const FAIL_MARKER   = path.join(PROJECT_ROOT, "hive", "outcomes", "LAST-EVAL-FAILED.md");

// Change this one line to switch agents
const adapter = require("./adapters/claude-code");
// const adapter = require("./adapters/codex");
// const adapter = require("./adapters/cursor");
// const adapter = require("./adapters/aider");
// const adapter = require("./adapters/manual");

function today() {
  return new Date().toISOString().split("T")[0];
}

function appendRow(bugsFound, rootCause) {
  const row = `| ${today()} | (fill in task summary) | yes | ${bugsFound} | automated eval | ${rootCause} | |\n`;
  fs.appendFileSync(OUTCOMES_FILE, row, "utf8");
}

function main() {
  const transcriptPath = adapter.getLatestTranscript(PROJECT_ROOT);

  if (!transcriptPath) {
    console.log("eval-session: no transcript found — skipping");
    return;
  }

  const calls = adapter.adapt(transcriptPath);
  const result = runRules(calls);

  if (result.pass) {
    appendRow("", "");
    if (fs.existsSync(FAIL_MARKER)) fs.unlinkSync(FAIL_MARKER);
    console.log("eval-session: PASS");
  } else {
    const reasons = result.failures.map(f => f.reason).join("; ");
    appendRow(reasons, "automated eval");
    fs.writeFileSync(FAIL_MARKER, reasons, "utf8");
    console.log("eval-session: FAIL —", reasons);
  }
}

main();
```

---

### 8. Register the Stop hook (Claude Code only)

`.claude/settings.json`

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [{
          "type": "command",
          "command": "node scripts/eval-session.js"
        }]
      }
    ]
  }
}
```

For all other agents: run `node scripts/eval-session.js` manually after each session
until that agent supports hooks.

---

### 9. Add the session start rule to AGENTS.md

```markdown
## On Session Start
If `hive/outcomes/LAST-EVAL-FAILED.md` exists:
1. Read it
2. Tell the user what failed in the previous session before doing anything else
3. Delete the file
```

---

## When Done

Confirm:
- [ ] `scripts/eval-session.js` exists
- [ ] `scripts/adapters/claude-code.js` — fully implemented
- [ ] `scripts/adapters/codex.js` — fully implemented
- [ ] `scripts/adapters/cursor.js` — placeholder with comments
- [ ] `scripts/adapters/aider.js` — placeholder with comments
- [ ] `scripts/adapters/manual.js` — fallback implemented
- [ ] `scripts/rules/index.js` — 3 starter rules
- [ ] `.claude/settings.json` — Stop hook registered
- [ ] `AGENTS.md` — session start rule added
- [ ] Run `node scripts/eval-session.js` manually and confirm a row appears in `hive/outcomes/current.md`
- [ ] Nothing else was changed
