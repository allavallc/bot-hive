import { db } from "@/db";
import { account, projects } from "@/db/schema";
import { auth } from "@/lib/auth";
import { and, desc, eq } from "drizzle-orm";
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

async function signOut() {
  "use server";
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (session?.user) {
    await revokeGithubGrant(session.user.id);
  }
  await auth.api.signOut({ headers: reqHeaders });
  redirect("/login");
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  const userProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.ownerId, session.user.id))
    .orderBy(desc(projects.createdAt));

  return (
    <main>
      <h1>Welcome, {session.user.name}.</h1>
      <h2>Your projects</h2>
      {userProjects.length === 0 ? (
        <p>No projects yet.</p>
      ) : (
        <ul>
          {userProjects.map((p) => (
            <li key={p.id}>
              <a href={`/projects/${p.id}`}>{p.displayName}</a> — <code>{p.githubRepo}</code> —{" "}
              {p.status}
            </li>
          ))}
        </ul>
      )}
      <p>
        <a href="/projects/new">Connect another repo</a>
      </p>
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
