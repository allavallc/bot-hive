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
        Bot Hive watches the <code>hive/</code> folder in your GitHub repo and renders every ticket
        as a live card. When a bot pushes a commit, the board updates within seconds — no manual
        refresh, no rebuild, no static HTML.
      </p>
      <p className={ui.lede}>
        The format and dev workflow are documented in <code>hive/HIVE.md</code>. Bot Hive owns the
        format — it's free to evolve.
      </p>
    </PageShell>
  );
}
