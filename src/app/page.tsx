import { PageShell } from "@/components/page-shell";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Hero } from "./hero.client";

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");

  return (
    <PageShell brandHref="/">
      <Hero />
    </PageShell>
  );
}
