import { PageShell, pageShellStyles as ui } from "@/components/page-shell";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { auth } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  const userProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.billingOwnerId, session.user.id))
    .orderBy(desc(projects.createdAt));

  return (
    <PageShell signedIn>
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
