import { PageShell, pageShellStyles as ui } from "@/components/page-shell";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function PricingPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <PageShell signedIn={!!session}>
      <span className={ui.kicker}>Pricing</span>
      <h1 className={ui.pageTitle}>Pay when the horde grows.</h1>
      <p className={ui.lede}>
        <strong>Free</strong> for up to 2 bots on a repo. <strong>$15/month</strong> per repo once
        you go past 2. <strong>Enterprise</strong> pricing exists for the odd case — reach out at{" "}
        <a href="/contact">allavallc@gmail.com</a> if you have a different shape in mind and we'll
        figure something out.
      </p>
    </PageShell>
  );
}
