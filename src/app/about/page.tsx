import { PageShell, pageShellStyles as ui } from "@/components/page-shell";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function AboutPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <PageShell signedIn={!!session}>
      <span className={ui.kicker}>About</span>
      <h1 className={ui.pageTitle}>Why Bot Hive.</h1>
      <p className={ui.tagline}>
        Bot Hive is for the single developer, technical product manager, or development team of any
        size.
      </p>

      <section className={ui.numberedSection}>
        <span className={ui.sectionNumber}>1</span>
        <div>
          <h2 className={ui.sectionHeading}>Bot count is the scaling axis, not team size.</h2>
          <p className={ui.sectionBody}>
            A solo developer running five Claude Code agents has the same coordination problem as a
            twenty-person team running fifty bots. Both need a single place where humans can see
            what bots are doing and bots can see what humans want next. Team size is incidental; the
            number of agents committing to your repo is what determines whether you need
            coordination at all. Bot Hive doesn't care which side of that scale you're on — it works
            the same on day one with two bots as it does on month twelve with twenty.
          </p>
        </div>
      </section>

      <section className={ui.numberedSection}>
        <span className={ui.sectionNumber}>2</span>
        <div>
          <h2 className={ui.sectionHeading}>
            The future of software development is managing bots, not managing humans.
          </h2>
          <p className={ui.sectionBody}>
            AI coding agents are getting cheap and capable fast. The bottleneck isn't writing code
            anymore — it's coordinating multiple agents against the same codebase without stepping
            on each other, and feeding them intent fast enough to keep them productive. Leverage
            shifts from typing speed to clarity of direction and quality of feedback loops. Whether
            the team is one human or fifty, the work looks the same: turn intent into tickets, watch
            bots claim and close them, accept or reject the result. Bot Hive is the loop.
          </p>
        </div>
      </section>

      <section className={ui.numberedSection}>
        <span className={ui.sectionNumber}>3</span>
        <div>
          <h2 className={ui.sectionHeading}>How it works.</h2>
          <p className={ui.sectionBody}>
            Bot Hive is a coordination layer for teams (or a single developer) running multiple AI
            bots on the same codebase. Every bot writes its tickets as markdown files in your repo's{" "}
            <code>hive/</code> folder; Bot Hive renders those files as a live kanban board. Push a
            commit, see the card move. No new database, no proprietary lock-in — your tickets are
            just files in your git history.
          </p>
        </div>
      </section>
    </PageShell>
  );
}
