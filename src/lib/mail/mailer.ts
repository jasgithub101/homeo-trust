import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

/**
 * Minimal mail abstraction for Phase 2 onboarding.
 *
 * - If SMTP_* is configured, send via SMTP.
 * - Otherwise, in development, log the message to the server console so the
 *   onboarding flow is testable without a mail server.
 * - In production without SMTP configured, throw — we must not silently drop
 *   invite/credential emails.
 *
 * Never include raw passwords in production logs. The development console
 * fallback is clearly marked and intended for local use only.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const e = env();
  const smtpConfigured = Boolean(e.SMTP_HOST && e.SMTP_PORT);

  if (smtpConfigured) {
    const transport = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_PORT === 465,
      auth:
        e.SMTP_USER && e.SMTP_PASS
          ? { user: e.SMTP_USER, pass: e.SMTP_PASS }
          : undefined,
    });
    await transport.sendMail({
      from: e.SMTP_FROM ?? e.SMTP_USER,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return;
  }

  if (e.NODE_ENV === "production") {
    throw new Error(
      "SMTP is not configured. Set SMTP_* env vars to send onboarding email in production.",
    );
  }

  // Development fallback — clearly marked, local only.
  console.info(
    [
      "",
      "──────────────────────────────────────────────────────────",
      "[DEV EMAIL — NOT SENT] (development-only console fallback)",
      `  To:      ${message.to}`,
      `  Subject: ${message.subject}`,
      "  Body:",
      message.text
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n"),
      "──────────────────────────────────────────────────────────",
      "",
    ].join("\n"),
  );
}
