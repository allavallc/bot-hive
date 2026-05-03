"use server";

import nodemailer from "nodemailer";

export type ContactResult = { ok: true } | { ok: false; error: string };

export async function sendContactEmail(formData: FormData): Promise<ContactResult> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name) return { ok: false, error: "Name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (!message) return { ok: false, error: "Message is required." };
  if (message.length > 5000) {
    return { ok: false, error: "Message is too long (max 5000 chars)." };
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.CONTACT_TO ?? "allavallc@gmail.com";

  if (!user || !pass) {
    console.error("[contact] SMTP_USER or SMTP_PASS not set");
    return {
      ok: false,
      error: "Email isn't configured on the server. Please email directly.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: user,
      to,
      replyTo: email,
      subject: `Bot Hive contact form — ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    });
    return { ok: true };
  } catch (err) {
    console.error("[contact] sendMail failed:", err);
    return {
      ok: false,
      error: "Could not send right now. Please try again or email directly.",
    };
  }
}
