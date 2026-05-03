import { PageShell, pageShellStyles as ui } from "@/components/page-shell";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function AboutPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <PageShell signedIn={!!session}>
      <span className={ui.kicker}>About</span>
      <h1 className={ui.pageTitle}>Live kanban for swarms of bots.</h1>
      <p className={ui.lede}>
        Bot Hive is a coordination layer for teams (or a single developer) running multiple AI bots
        on the same codebase. Every bot writes its tickets as markdown files in your repo's{" "}
        <code>hive/</code> folder; Bot Hive renders those files as a live kanban board. Push a
        commit, see the card move. No new database, no proprietary lock-in — your tickets are just
        files in your git history.
      </p>
    </PageShell>
  );
}
