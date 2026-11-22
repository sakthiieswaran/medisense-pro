/**
 * MediSense Email Delivery Service (Resend SDK + Optional SMTP via Nodemailer)
 * ------------------------------------------------------------------------------
 * Supports Resend API (official SDK) as primary provider, with graceful fallback
 * to SMTP or disabled state. Never reports emails as sent when unconfigured.
 */
import { Resend } from "resend";
import nodemailer from "nodemailer";

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderPasswordResetHtml({ name, token }) {
  const safeName = name ? escapeHtml(name) : "MediSense Member";
  const safeToken = escapeHtml(token);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MediSense Password Reset Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header Banner -->
          <tr>
            <td style="padding: 28px 32px; background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background: rgba(255,255,255,0.2); border-radius: 10px; width: 36px; height: 36px; text-align: center; vertical-align: middle;">
                    <span style="font-size: 20px; color: #ffffff; line-height: 36px;">✚</span>
                  </td>
                  <td style="padding-left: 12px;">
                    <span style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">MediSense</span>
                  </td>
                </tr>
              </table>
              <h1 style="margin: 16px 0 0 0; font-size: 20px; font-weight: 600; color: #ffffff; letter-spacing: -0.3px;">
                Password Reset Verification
              </h1>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; color: #334155;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px; color: #334155;">
                Hello <strong>${safeName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #475569;">
                We received a request to reset the password for your MediSense account. Please enter the following 6-digit verification code in MediSense to set a new password:
              </p>
              
              <!-- OTP Box -->
              <div style="background-color: #f0fdfa; border: 1.5px solid #99f6e4; border-radius: 12px; padding: 22px 20px; text-align: center; margin: 0 0 24px 0;">
                <div style="font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #0d9488; margin-bottom: 8px;">
                  Your 6-Digit Verification Code
                </div>
                <div style="font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, Monaco, Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f766e; line-height: 1.2;">
                  ${safeToken}
                </div>
                <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
                  Valid for 30 minutes · Single-use only
                </div>
              </div>

              <!-- Security Callout -->
              <div style="background-color: #f8fafc; border-left: 4px solid #0d9488; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 12.5px; line-height: 19px; color: #475569;">
                  <strong style="color: #1e293b;">Security Notice:</strong> Never share this code with anyone. MediSense clinicians and support representatives will never ask for your verification code. If you did not initiate this request, you can safely ignore this email — your account remains secure.
                </p>
              </div>

              <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 22px;">
                Stay healthy,<br>
                <strong style="color: #1e293b;">The MediSense Health Team</strong>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px 28px 32px; border-top: 1px solid #f1f5f9; background-color: #f8fafc; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #94a3b8;">
                &copy; 2026 MediSense Health. All rights reserved.
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 18px;">
                HIPAA &amp; DPDP Compliant Healthcare Platform · Private &amp; Encrypted Medical Records
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderPasswordResetText({ name, token }) {
  return `Hello ${name || "there"},

Use this 6-digit verification code to reset your MediSense password:

  ${token}

This code will expire in 30 minutes.

Security Notice: Never share this code with anyone. MediSense staff will never ask for your code. If you did not request a password reset, you can safely ignore this message.

— The MediSense Health Team`;
}

export function renderVerificationHtml({ name, token }) {
  const safeName = name ? escapeHtml(name) : "MediSense Member";
  const safeToken = escapeHtml(token);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Verify your MediSense Email</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden;">
          <tr>
            <td style="padding: 28px 32px; background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);">
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff;">MediSense</h1>
              <div style="font-size: 15px; color: #ffffff; opacity: 0.9; margin-top: 4px;">Confirm your email address</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px; color: #334155;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px;">Hello <strong>${safeName}</strong>,</p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #475569;">
                Welcome to MediSense! Please use the verification token below to confirm your account:
              </p>
              <div style="background-color: #f0fdfa; border: 1.5px solid #99f6e4; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
                <div style="font-family: monospace; font-size: 24px; font-weight: 700; letter-spacing: 2px; color: #0f766e; word-break: break-all;">
                  ${safeToken}
                </div>
              </div>
              <p style="margin: 0; font-size: 14px; color: #64748b;">If you did not create this account, you can safely ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderVerificationText({ name, token }) {
  return `Hello ${name || "there"},

Welcome to MediSense! Use this verification token to confirm your email address:

  ${token}

If you did not create this account, you can safely ignore this message.

— The MediSense Health Team`;
}

export function createMailer(firstArg, secondArg) {
  let smtpConfig = { configured: false };
  let resendConfig = { configured: false };

  if (firstArg && (firstArg.smtp !== undefined || firstArg.resend !== undefined)) {
    smtpConfig = firstArg.smtp || { configured: false };
    resendConfig = firstArg.resend || { configured: false };
  } else {
    smtpConfig = firstArg || { configured: false };
    resendConfig = secondArg || { configured: false };
  }

  // 1. Resend SDK provider (primary)
  if (resendConfig?.configured && resendConfig?.apiKey) {
    const resend = new Resend(resendConfig.apiKey);
    const fromAddress = resendConfig.from || "MediSense <onboarding@resend.dev>";

    return {
      isConfigured: true,
      provider: "resend",
      async sendVerificationEmail({ to, name, token }) {
        try {
          const { data, error } = await resend.emails.send({
            from: fromAddress,
            to: [to],
            subject: "Verify your MediSense email address",
            html: renderVerificationHtml({ name, token }),
            text: renderVerificationText({ name, token }),
          });
          if (error) {
            console.error("[medisense-mail] Resend verification email failed:", error.message || error);
            const isRateLimit =
              error.name === "rate_limit_exceeded" ||
              error.statusCode === 429 ||
              String(error.message).toLowerCase().includes("rate limit");
            return {
              sent: false,
              reason: isRateLimit ? "RATE_LIMIT_EXCEEDED" : "RESEND_DELIVERY_FAILED",
              error: error.message || "Failed to deliver email",
            };
          }
          return { sent: true, messageId: data?.id || null, provider: "resend" };
        } catch (err) {
          console.error("[medisense-mail] Resend verification unexpected error:", err?.message || err);
          return { sent: false, reason: "RESEND_DELIVERY_FAILED", error: err?.message };
        }
      },
      async sendPasswordResetEmail({ to, name, token }) {
        try {
          const { data, error } = await resend.emails.send({
            from: fromAddress,
            to: [to],
            subject: `MediSense Password Reset Code: ${token}`,
            html: renderPasswordResetHtml({ name, token }),
            text: renderPasswordResetText({ name, token }),
          });
          if (error) {
            console.error("[medisense-mail] Resend password reset email failed:", error.message || error);
            const isRateLimit =
              error.name === "rate_limit_exceeded" ||
              error.statusCode === 429 ||
              String(error.message).toLowerCase().includes("rate limit");
            return {
              sent: false,
              reason: isRateLimit ? "RATE_LIMIT_EXCEEDED" : "RESEND_DELIVERY_FAILED",
              error: error.message || "Failed to deliver email",
            };
          }
          return { sent: true, messageId: data?.id || null, provider: "resend" };
        } catch (err) {
          console.error("[medisense-mail] Resend password reset unexpected error:", err?.message || err);
          return { sent: false, reason: "RESEND_DELIVERY_FAILED", error: err?.message };
        }
      },
    };
  }

  // 2. SMTP provider fallback (Nodemailer)
  if (smtpConfig?.configured) {
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

    async function deliverSmtp({ to, subject, html, text }) {
      try {
        const info = await transporter.sendMail({
          from: smtpConfig.from,
          to,
          subject,
          html,
          text,
        });
        return { sent: true, messageId: info?.messageId || null, provider: "smtp" };
      } catch (err) {
        console.error("[medisense-mail] SMTP delivery failed:", err?.message || "unknown error");
        return { sent: false, reason: "SMTP_DELIVERY_FAILED" };
      }
    }

    return {
      isConfigured: true,
      provider: "smtp",
      async sendVerificationEmail({ to, name, token }) {
        return deliverSmtp({
          to,
          subject: "Verify your MediSense email address",
          html: renderVerificationHtml({ name, token }),
          text: renderVerificationText({ name, token }),
        });
      },
      async sendPasswordResetEmail({ to, name, token }) {
        return deliverSmtp({
          to,
          subject: `MediSense password reset code: ${token}`,
          html: renderPasswordResetHtml({ name, token }),
          text: renderPasswordResetText({ name, token }),
        });
      },
    };
  }

  // 3. Unconfigured fallback
  return {
    isConfigured: false,
    provider: "none",
    async sendVerificationEmail() {
      return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
    },
    async sendPasswordResetEmail() {
      return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
    },
  };
}
