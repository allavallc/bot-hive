import { PageShell } from "@/components/page-shell";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Hero } from "./hero.client";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ signedOut?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");

  const params = await searchParams;
  const signedOut = params.signedOut === "1";

  return (
    <PageShell brandHref="/">
      <Hero signedOut={signedOut} />
    </PageShell>
  );
}
