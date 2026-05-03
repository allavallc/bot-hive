"use client";

import { pageShellStyles as ui } from "@/components/page-shell";
import { sendContactEmail } from "@/lib/contact-action";
import { useState } from "react";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setStatus("sending");
    setError(null);
    const result = await sendContactEmail(formData);
    if (result.ok) {
      setStatus("sent");
      const form = document.querySelector<HTMLFormElement>("form[data-contact-form]");
      form?.reset();
    } else {
      setStatus("error");
      setError(result.error);
    }
  }

  return (
    <form action={action} className={ui.form} data-contact-form>
      <label className={ui.formField}>
        <span className={ui.formLabel}>Name</span>
        <input name="name" type="text" className={ui.formInput} required autoComplete="name" />
      </label>
      <label className={ui.formField}>
        <span className={ui.formLabel}>Email</span>
        <input name="email" type="email" className={ui.formInput} required autoComplete="email" />
      </label>
      <label className={ui.formField}>
        <span className={ui.formLabel}>Message</span>
        <textarea name="message" rows={6} className={ui.formTextarea} required maxLength={5000} />
      </label>
      <div className={ui.formActions}>
        <button type="submit" className={ui.btnOut} disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send →"}
        </button>
        {status === "sent" && <span className={ui.formSuccess}>Sent. Talk soon.</span>}
        {status === "error" && error && <span className={ui.formError}>{error}</span>}
      </div>
    </form>
  );
}
