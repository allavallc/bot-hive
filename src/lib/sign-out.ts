"use server";

import { db } from "@/db";
import { account } from "@/db/schema";
import { invalidateUserCache } from "@/lib/access";
import { auth } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

async function revokeGithubGrant(userId: string) {
  const [acct] = await db
    .select({ accessToken: account.accessToken })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "github")))
    .limit(1);

  if (!acct?.accessToken) return;

  const clientId = process.env.GITHUB_CLIENT_ID ?? "";
  const clientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    await fetch(`https://api.github.com/applications/${clientId}/grant`, {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: acct.accessToken }),
    });
  } catch {
    // Don't block local sign-out if the revoke call fails.
  }
}

export async function signOutAction() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (session?.user) {
    invalidateUserCache(session.user.id);
    await revokeGithubGrant(session.user.id);
  }
  await auth.api.signOut({ headers: reqHeaders });
  redirect("/");
}
