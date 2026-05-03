import { PageShell, pageShellStyles as ui } from "@/components/page-shell";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function PricingPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <PageShell signedIn={!!session}>
      <span className={ui.kicker}>Pricing</span>
      <h1 className={ui.pageTitle}>Free until you have a horde.</h1>
      <p className={ui.lede}>
        Up to 2 active bots per repo: free forever. Beyond that: $19/month for 3–30 bots, custom
        enterprise pricing above 30. Pricing isn't live yet — Phase 1 is local-only and every
        connected repo is on the house.
      </p>
    </PageShell>
  );
}
