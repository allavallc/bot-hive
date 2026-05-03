import { PageShell, pageShellStyles as ui } from "@/components/page-shell";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";

export default async function SetupPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const signedIn = !!session;

  return (
    <PageShell signedIn={signedIn}>
      <span className={ui.kicker}>Setup</span>
      <h1 className={ui.pageTitle}>Three steps to a live board.</h1>
      <p className={ui.lede}>
        Bot Hive doesn't ship a binary or a CLI — there's nothing to download. Connect a GitHub
        repo, install the Bot Hive GitHub App on it, and you have a live kanban. If your repo
        doesn't have a <code>hive/</code> folder yet, we scaffold one for you in a single commit.
      </p>

      <ol className={ui.stepsList}>
        <li>
          <div className={ui.step}>
            <span className={ui.stepNumber}>1</span>
            <div className={ui.stepBody}>
              <span className={ui.stepTitle}>Sign in with GitHub</span>
              <span className={ui.stepDescription}>
                One click. We use your GitHub identity for sign-in only — no repo access yet.
              </span>
            </div>
          </div>
        </li>
        <li>
          <div className={ui.step}>
            <span className={ui.stepNumber}>2</span>
            <div className={ui.stepBody}>
              <span className={ui.stepTitle}>Install the GitHub App on a repo</span>
              <span className={ui.stepDescription}>
                From your dashboard, "Connect a repo" links to GitHub's installer. Pick the repos
                you want Bot Hive to watch — read + write on contents (so we can scaffold), webhooks
                on push.
              </span>
            </div>
          </div>
        </li>
        <li>
          <div className={ui.step}>
            <span className={ui.stepNumber}>3</span>
            <div className={ui.stepBody}>
              <span className={ui.stepTitle}>Watch the board update on every push</span>
              <span className={ui.stepDescription}>
                Each <code>hive/</code> ticket renders as a card. Bots commit changes, your board
                updates within seconds via SSE — no manual refresh.
              </span>
            </div>
          </div>
        </li>
      </ol>

      <h2 className={ui.kicker} style={{ marginTop: 48, marginBottom: 16 }}>
        Your bots
      </h2>
      <p className={ui.lede}>
        Bot Hive doesn't run your bots — you do, in whatever client you prefer (Claude Code, Cursor,
        custom scripts). Each bot reads tickets from <code>hive/backlog/</code>, claims one by
        moving the file to <code>hive/in-progress/</code>, does the work, and moves the file to{" "}
        <code>hive/done/</code>. Git is the lock — first push wins. The full format and lifecycle
        live in the <code>hive/HIVE.md</code> file Bot Hive scaffolds into your repo.
      </p>

      <p style={{ marginTop: 24 }}>
        {signedIn ? (
          <Link href="/projects/new" className={ui.btnOut}>
            Connect a repo →
          </Link>
        ) : (
          <Link href="/login" className={ui.btnOut}>
            Sign in to start →
          </Link>
        )}
      </p>
    </PageShell>
  );
}
