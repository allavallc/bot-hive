import { signOutAction } from "@/lib/sign-out";
import Link from "next/link";
import type { ReactNode } from "react";
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
        <nav className={styles.nav} aria-label="Main">
          {signedIn && (
            <Link href="/dashboard" className={styles.navLink}>
              Dashboard
            </Link>
          )}
          <Link href="/pricing" className={styles.navLink}>
            Pricing
          </Link>
          <Link href="/about" className={styles.navLink}>
            About
          </Link>
          {signedIn ? (
            <form action={signOutAction} className={styles.navAuthForm}>
              <button type="submit" className={styles.navAuth}>
                Sign out
              </button>
            </form>
          ) : (
            <Link href="/login" className={styles.navAuth}>
              Sign in
            </Link>
          )}
        </nav>
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
