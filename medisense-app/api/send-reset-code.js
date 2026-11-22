import { Resend } from "resend";

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { email, code, name } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ error: "Email and verification code are required." });
  }

  const apiKey = process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "RESEND_API_KEY is not configured in Vercel environment variables.",
      configured: false,
    });
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const fromAddress = fromEmail.includes("<") ? fromEmail : `MediSense <${fromEmail}>`;

  try {
    const resend = new Resend(apiKey.trim());
    const safeName = name ? escapeHtml(name) : "MediSense Member";
    const safeCode = escapeHtml(code);

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [String(email).trim().toLowerCase()],
      subject: `MediSense Password Reset Code: ${code}`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MediSense Password Reset Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
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
          <tr>
            <td style="padding: 32px 32px 24px 32px; color: #334155;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px; color: #334155;">
                Hello <strong>${safeName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #475569;">
                We received a request to reset the password for your MediSense account. Please enter the following 6-digit verification code in MediSense to set a new password:
              </p>
              <div style="background-color: #f0fdfa; border: 1.5px solid #99f6e4; border-radius: 12px; padding: 22px 20px; text-align: center; margin: 0 0 24px 0;">
                <div style="font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #0d9488; margin-bottom: 8px;">
                  Your 6-Digit Verification Code
                </div>
                <div style="font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, Monaco, Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f766e; line-height: 1.2;">
                  ${safeCode}
                </div>
                <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
                  Valid for 30 minutes · Single-use only
                </div>
              </div>
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
</html>`,
      text: `Hello ${name || "there"},\n\nUse this 6-digit verification code to reset your MediSense password:\n\n  ${code}\n\nThis code will expire in 30 minutes.\n\n— The MediSense Health Team`,
    });

    if (error) {
      console.error("[medisense-serverless] Resend error:", error);
      return res.status(error.statusCode || 500).json({
        error: error.message || "Failed to dispatch email",
      });
    }

    return res.status(200).json({ ok: true, id: data?.id || null });
  } catch (err) {
    console.error("[medisense-serverless] Unexpected failure:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
