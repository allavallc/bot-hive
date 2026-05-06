import { createHash, randomBytes } from "node:crypto";
import { db } from "@/db";
import { botTokens } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

const TOKEN_PREFIX = "bh_";
const TOKEN_BYTE_LEN = 32;

export type BotTokenInfo = {
  id: string;
  projectId: string;
  createdBy: string;
  displayName: string;
};

export type BotTokenSummary = {
  id: string;
  displayName: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export function generateRawToken(): string {
  return TOKEN_PREFIX + randomBytes(TOKEN_BYTE_LEN).toString("base64url");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function createToken(input: {
  projectId: string;
  createdBy: string;
  displayName: string;
}): Promise<{ id: string; raw: string }> {
  const raw = generateRawToken();
  const tokenHash = hashToken(raw);
  const [row] = await db
    .insert(botTokens)
    .values({
      projectId: input.projectId,
      createdBy: input.createdBy,
      displayName: input.displayName,
      tokenHash,
    })
    .returning({ id: botTokens.id });
  return { id: row.id, raw };
}

export async function validateToken(raw: string): Promise<BotTokenInfo | null> {
  if (!raw.startsWith(TOKEN_PREFIX)) return null;
  const tokenHash = hashToken(raw);
  const [row] = await db
    .select({
      id: botTokens.id,
      projectId: botTokens.projectId,
      createdBy: botTokens.createdBy,
      displayName: botTokens.displayName,
      revokedAt: botTokens.revokedAt,
    })
    .from(botTokens)
    .where(eq(botTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.revokedAt) return null;
  // Best-effort lastUsedAt update; failures shouldn't block the request.
  void db
    .update(botTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(botTokens.id, row.id))
    .catch(() => {});
  return {
    id: row.id,
    projectId: row.projectId,
    createdBy: row.createdBy,
    displayName: row.displayName,
  };
}

export async function listActiveTokens(projectId: string): Promise<BotTokenSummary[]> {
  return db
    .select({
      id: botTokens.id,
      displayName: botTokens.displayName,
      createdAt: botTokens.createdAt,
      lastUsedAt: botTokens.lastUsedAt,
      revokedAt: botTokens.revokedAt,
    })
    .from(botTokens)
    .where(and(eq(botTokens.projectId, projectId), isNull(botTokens.revokedAt)));
}

export async function revokeToken(tokenId: string, projectId: string): Promise<boolean> {
  const result = await db
    .update(botTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(botTokens.id, tokenId), eq(botTokens.projectId, projectId)))
    .returning({ id: botTokens.id });
  return result.length > 0;
}
