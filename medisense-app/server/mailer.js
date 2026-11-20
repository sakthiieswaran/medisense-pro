/**
 * MediSense Email Delivery Service (Optional SMTP via Nodemailer)
 * ----------------------------------------------------------------
 * Validates SMTP configuration before creating any transport and never reports
 * emails as sent when no real SMTP provider is configured.
 */
import nodemailer from "nodemailer";

export function createMailer(smtpConfig = { configured: false }) {
  if (!smtpConfig?.configured) {
    return {
      isConfigured: false,
      async sendVerificationEmail() {
        return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
      },
      async sendPasswordResetEmail() {
        return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
      },
    };
  }

  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.port === 465,
    auth:
      smtpConfig.user && smtpConfig.password
        ? { user: smtpConfig.user, pass: smtpConfig.password }
        : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });

  async function deliver({ to, subject, text }) {
    try {
      const info = await transporter.sendMail({
        from: smtpConfig.from,
        to,
        subject,
        text,
      });
      return { sent: true, messageId: info?.messageId || null };
    } catch (err) {
      console.error("[medisense-mail] SMTP delivery failed:", err?.message || "unknown error");
      return { sent: false, reason: "SMTP_DELIVERY_FAILED" };
    }
  }

  return {
    isConfigured: true,
    async sendVerificationEmail({ to, name, token }) {
      return deliver({
        to,
        subject: "Verify your MediSense email address",
        text: `Hello ${name || "there"},\n\nUse this verification token in MediSense to confirm your email address:\n\n${token}\n\nIf you did not create this account, you can safely ignore this message.`,
      });
    },
    async sendPasswordResetEmail({ to, name, token }) {
      return deliver({
        to,
        subject: "MediSense password reset code",
        text: `Hello ${name || "there"},\n\nUse this time-limited code (valid for 30 minutes) to reset your MediSense password:\n\n${token}\n\nIf you did not request a password reset, you can safely ignore this message.`,
      });
    },
  };
}
