import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { App } from "@octokit/app";
import { Octokit } from "@octokit/core";

function expandHome(p: string): string {
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
    return join(homedir(), p.slice(1).replace(/^[\\/]+/, ""));
  }
  return p;
}

function loadPrivateKey(): string {
  // Prefer the inline env var (the canonical pattern for serverless / Render).
  const inline = process.env.GITHUB_APP_PRIVATE_KEY;
  if (inline) {
    // Accept either real newlines or escaped \n (common when pasting into
    // a single-line env-var UI).
    return inline.includes("\\n") ? inline.replace(/\\n/g, "\n") : inline;
  }

  // Fall back to a filesystem path (convenient for local dev where the
  // PEM lives in ~/.github-app-keys/).
  const path = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  if (path) {
    return readFileSync(expandHome(path), "utf8");
  }

  throw new Error(
    "GitHub App private key missing — set GITHUB_APP_PRIVATE_KEY (env var contents) or GITHUB_APP_PRIVATE_KEY_PATH (file path).",
  );
}

let appInstance: App | null = null;

export function getApp(): App {
  if (appInstance) return appInstance;

  const appId = process.env.GITHUB_APP_ID;
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!appId) throw new Error("GITHUB_APP_ID is not set");
  if (!webhookSecret) throw new Error("GITHUB_APP_WEBHOOK_SECRET is not set");

  appInstance = new App({
    appId,
    privateKey: loadPrivateKey(),
    webhooks: { secret: webhookSecret },
  });
  return appInstance;
}

export function appOctokit(): Octokit {
  return getApp().octokit;
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
type TokenEntry = { token: string; expiresAt: number };

const tokenCache = new Map<number, TokenEntry>();
const inFlight = new Map<number, Promise<TokenEntry>>();

async function mintInstallationToken(installationId: number): Promise<TokenEntry> {
  const response = await appOctokit().request(
    "POST /app/installations/{installation_id}/access_tokens",
    { installation_id: installationId },
  );
  return {
    token: response.data.token,
    expiresAt: Date.parse(response.data.expires_at),
  };
}

async function getInstallationToken(installationId: number): Promise<TokenEntry> {
  const now = Date.now();
  const hit = tokenCache.get(installationId);
  if (hit && hit.expiresAt - now > TOKEN_REFRESH_BUFFER_MS) {
    return hit;
  }

  const existing = inFlight.get(installationId);
  if (existing) return existing;

  const promise = mintInstallationToken(installationId).then((result) => {
    tokenCache.set(installationId, result);
    return result;
  });
  inFlight.set(installationId, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(installationId);
  }
}

export async function installationOctokit(installationId: number): Promise<Octokit> {
  const { token } = await getInstallationToken(installationId);
  return new Octokit({ auth: token });
}
