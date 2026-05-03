import { PageShell, SignOutForm, pageShellStyles as ui } from "@/components/page-shell";
import { db } from "@/db";
import { account, projects } from "@/db/schema";
import { auth } from "@/lib/auth";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
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
    <PageShell rightSlot={<SignOutForm action={signOut} />}>
      <span className={ui.kicker}>Dashboard / {session.user.name}</span>
      <h1 className={ui.pageTitle}>Your projects</h1>
      <p className={ui.lede}>
        Each row is a GitHub repo connected to Bot Hive. Click a repo to open its live board.
      </p>

      {userProjects.length === 0 ? (
        <p className={ui.lede}>No projects yet.</p>
      ) : (
        <ul className={ui.list}>
          {userProjects.map((p, i) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className={ui.listItem}>
                <span className={ui.listItemNumber}>{String(i + 1).padStart(2, "0")}</span>
                <span className={ui.listItemBody}>
                  <span className={ui.listItemTitle}>{p.displayName}</span>
                  <span className={ui.listItemMeta}>{p.githubRepo}</span>
                </span>
                <span className={ui.listItemStatus} data-status={p.status}>
                  {p.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p style={{ marginTop: 32 }}>
        <Link href="/projects/new" className={ui.btnOut}>
          Connect another repo →
        </Link>
      </p>
    </PageShell>
  );
}
