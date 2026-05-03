"use client";

import { signOutAction } from "@/lib/sign-out";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./page-shell.module.css";

const PUBLIC_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/setup", label: "Setup" },
  { href: "/about", label: "About" },
] as const;

export function PageNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname() ?? "";
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className={styles.nav} aria-label="Main">
      {signedIn && (
        <Link
          href="/dashboard"
          className={`${styles.navLink} ${isActive("/dashboard") ? styles.navLinkActive : ""}`}
        >
          Dashboard
        </Link>
      )}
      {PUBLIC_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`${styles.navLink} ${isActive(link.href) ? styles.navLinkActive : ""}`}
        >
          {link.label}
        </Link>
      ))}
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
  );
}
