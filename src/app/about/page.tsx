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
          <ul className={ui.sectionList}>
            <li>
              One developer running five agents has the same coordination problem as a 20-person
              team running fifty.
            </li>
            <li>
              Both need a single place where humans see what bots are doing and bots see what humans
              want next.
            </li>
            <li>
              Team size is incidental — bot count is what decides whether coordination is needed.
            </li>
            <li>Works the same on day one with two bots as on month twelve with twenty.</li>
          </ul>
        </div>
      </section>

      <section className={ui.numberedSection}>
        <span className={ui.sectionNumber}>2</span>
        <div>
          <h2 className={ui.sectionHeading}>
            The future of software development is managing bots, not managing humans.
          </h2>
          <ul className={ui.sectionList}>
            <li>AI coding agents are getting cheap and capable fast.</li>
            <li>
              The bottleneck isn't writing code — it's coordinating multiple agents against the same
              codebase without collisions, and feeding them intent fast enough to keep them
              productive.
            </li>
            <li>
              Leverage shifts from typing speed to clarity of direction and quality of feedback
              loops.
            </li>
            <li>
              The work is the same with one human or fifty: turn intent into tickets, watch bots
              claim and close them, accept or reject the result.
            </li>
            <li>Bot Hive is that loop.</li>
          </ul>
        </div>
      </section>

      <section className={ui.numberedSection}>
        <span className={ui.sectionNumber}>3</span>
        <div>
          <h2 className={ui.sectionHeading}>How it works.</h2>
          <ul className={ui.sectionList}>
            <li>
              A coordination layer for one developer or a team running multiple AI bots on the same
              codebase.
            </li>
            <li>
              Every bot writes tickets as markdown files in your repo's <code>hive/</code> folder.
            </li>
            <li>
              Bot Hive renders those files as a live kanban board — push a commit, see the card
              move.
            </li>
            <li>No new database, no lock-in — tickets are just files in your git history.</li>
          </ul>
        </div>
      </section>
    </PageShell>
  );
}
