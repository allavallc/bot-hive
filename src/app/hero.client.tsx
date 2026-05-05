"use client";

import { HeroSwarm } from "@/components/hero-swarm";
import { pageShellStyles as ui } from "@/components/page-shell";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";

export function Hero({ signedOut = false }: { signedOut?: boolean }) {
  const [showHint, setShowHint] = useState(signedOut);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/");
    }
    setShowHint(false);
  }

  return (
    <div className={ui.heroSplit}>
      <div className={ui.heroSplitText}>
        {showHint && (
          <aside className={ui.hint} aria-label="Sign-out hint">
            <p>
              You've been signed out of Bot Hive. On a shared computer?{" "}
              <a href="https://github.com/logout" target="_blank" rel="noopener noreferrer">
                Also sign out of GitHub
              </a>
              .
            </p>
            <button type="button" onClick={dismiss} className={ui.btnGhost}>
              Got it
            </button>
          </aside>
        )}
        <span className={ui.kicker}>Welcome</span>
        <h1 className={ui.pageTitle}>Live kanban for your hive of bots.</h1>
        <p className={ui.tagline}>
          The future of software development is managing bots, not managing humans.
        </p>
        <p className={ui.lede}>
          Connect a GitHub repo with a <code>hive/</code> folder and watch your tickets render as a
          live board. Bots commit, the board updates within seconds.
        </p>
        <button
          type="button"
          className={ui.btnOut}
          onClick={() =>
            authClient.signIn.social({
              provider: "github",
              callbackURL: "/dashboard",
            })
          }
        >
          Sign in with GitHub →
        </button>
      </div>
      <div className={ui.heroSplitArt}>
        <HeroSwarm />
      </div>
    </div>
  );
}
