import Link from "next/link";
import type { ReactNode } from "react";
import { PageNav } from "./page-nav";
import styles from "./page-shell.module.css";
import { Wordmark } from "./wordmark";

export function PageShell({
  children,
  signedIn = false,
  brandHref = "/",
  showCrumb = false,
  crumbHref = "/dashboard",
  crumbLabel = "← Dashboard",
}: {
  children: ReactNode;
  signedIn?: boolean;
  brandHref?: string;
  showCrumb?: boolean;
  crumbHref?: string;
  crumbLabel?: string;
}) {
  return (
    <div className={styles.root}>
      <header className={styles.masthead}>
        <Link href={brandHref} className={styles.brand} aria-label="Bot Hive">
          <Wordmark height={28} />
        </Link>
        <PageNav signedIn={signedIn} />
      </header>
      <main className={styles.main}>
        {showCrumb && (
          <nav className={styles.subnav}>
            <Link href={crumbHref} className={styles.crumb}>
              {crumbLabel}
            </Link>
          </nav>
        )}
        {children}
      </main>
    </div>
  );
}

export { styles as pageShellStyles };
