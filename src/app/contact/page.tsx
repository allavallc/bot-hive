import { PageShell, pageShellStyles as ui } from "@/components/page-shell";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ContactForm } from "./contact-form.client";

export default async function ContactPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <PageShell signedIn={!!session}>
      <span className={ui.kicker}>Contact</span>
      <h1 className={ui.pageTitle}>Get in touch.</h1>
      <p className={ui.lede}>
        Question, feedback, custom pricing — drop a line. Goes straight to{" "}
        <a href="mailto:allavallc@gmail.com">allavallc@gmail.com</a>.
      </p>
      <ContactForm />
    </PageShell>
  );
}
