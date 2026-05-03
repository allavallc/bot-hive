import { PageShell, pageShellStyles as ui } from "@/components/page-shell";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";

export default async function PricingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const signedIn = !!session;
  const ctaHref = signedIn ? "/projects/new" : "/login";
  const ctaLabel = signedIn ? "Connect a repo →" : "Sign in →";

  return (
    <PageShell signedIn={signedIn}>
      <span className={ui.kicker}>Pricing</span>
      <h1 className={ui.pageTitle}>Pay when the hive grows.</h1>
      <p className={ui.lede}>
        Free for small bot fleets, simple per-repo pricing once you scale up, and a third option for
        the cases pricing tables can't capture.
      </p>

      <div className={ui.pricingGrid}>
        <div className={ui.pricingCard}>
          <span className={ui.pricingTier}>Free</span>
          <div className={ui.priceRow}>
            <span className={ui.priceAmount}>$0</span>
            <span className={ui.priceSuffix}>forever</span>
          </div>
          <p className={ui.pricingBlurb}>
            For solo developers and small experiments. Try the loop with no credit card.
          </p>
          <ul className={ui.featureList}>
            <li>Up to 2 active bots per repo</li>
            <li>Unlimited connected repos</li>
            <li>Live kanban + SSE updates</li>
            <li>Email support, best effort</li>
          </ul>
          <p className={ui.pricingCta}>
            <Link href={ctaHref} className={ui.btnOut}>
              {ctaLabel}
            </Link>
          </p>
        </div>

        <div className={`${ui.pricingCard} ${ui.pricingCardFeatured}`}>
          <span className={ui.pricingTier}>Team</span>
          <div className={ui.priceRow}>
            <span className={ui.priceAmount}>$15</span>
            <span className={ui.priceSuffix}>/ month per repo</span>
          </div>
          <p className={ui.pricingBlurb}>
            Once a repo has more than 2 bots running on it, $15/month covers that repo. Other repos
            stay free.
          </p>
          <ul className={ui.featureList}>
            <li>Unlimited active bots per repo</li>
            <li>Unlimited connected repos</li>
            <li>Live kanban + SSE updates</li>
            <li>Priority email support</li>
            <li>Per-repo billing — only pay for the repos that need it</li>
          </ul>
          <p className={ui.pricingCta}>
            <Link href={ctaHref} className={ui.btnOut}>
              {ctaLabel}
            </Link>
          </p>
        </div>

        <div className={ui.pricingCard}>
          <span className={ui.pricingTier}>Enterprise</span>
          <div className={ui.priceRow}>
            <span className={ui.priceAmount}>Custom</span>
            <span className={ui.priceSuffix}>reach out</span>
          </div>
          <p className={ui.pricingBlurb}>
            Sometimes pricing is odd for a situation. Reach out if you have a different shape in
            mind and we'll figure something out.
          </p>
          <ul className={ui.featureList}>
            <li>Volume discounts above 30 bots</li>
            <li>SSO / SAML, dedicated support channel</li>
            <li>Custom integrations and adapters</li>
            <li>Self-hosted option on request</li>
          </ul>
          <p className={ui.pricingCta}>
            <Link href="/contact" className={ui.btnOut}>
              Contact us →
            </Link>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
