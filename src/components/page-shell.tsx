import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./page-shell.module.css";
import { Wordmark } from "./wordmark";

export function PageShell({
  children,
  brandHref = "/",
  rightSlot,
  showCrumb = false,
  crumbHref = "/dashboard",
  crumbLabel = "← Dashboard",
}: {
  children: ReactNode;
  brandHref?: string;
  rightSlot?: ReactNode;
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
        {rightSlot && <div className={styles.mastheadMeta}>{rightSlot}</div>}
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

export function SignOutForm({
  action,
}: {
  action: () => void | Promise<void>;
}) {
  return (
    <form action={action}>
      <button type="submit" className={styles.btnGhost}>
        Sign out
      </button>
    </form>
  );
}

export { styles as pageShellStyles };
