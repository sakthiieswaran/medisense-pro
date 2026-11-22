import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createMailer,
  renderPasswordResetHtml,
  renderPasswordResetText,
} from "../mailer.js";

describe("Resend Mailer & 6-Digit OTP Email Verification", () => {
  it("renders branded MediSense HTML email containing the 6-digit OTP code", () => {
    const html = renderPasswordResetHtml({ name: "Alex Mercer", token: "492015" });
    assert.ok(html.includes("MediSense"));
    assert.ok(html.includes("Alex Mercer"));
    assert.ok(html.includes("492015"));
    assert.ok(html.includes("30 minutes"));
    assert.ok(html.includes("HIPAA &amp; DPDP Compliant"));

    const text = renderPasswordResetText({ name: "Alex Mercer", token: "492015" });
    assert.ok(text.includes("492015"));
    assert.ok(text.includes("30 minutes"));
    assert.ok(text.includes("The MediSense Health Team"));
  });

  it("escapes user input to prevent HTML injection in emails", () => {
    const maliciousName = '<script>alert("xss")</script>';
    const html = renderPasswordResetHtml({ name: maliciousName, token: "123456" });
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  it("initializes Resend provider when configured", () => {
    const mailer = createMailer(null, {
      configured: true,
      apiKey: "re_test_mock_key_1234567890",
      from: "MediSense <onboarding@resend.dev>",
    });
    assert.equal(mailer.isConfigured, true);
    assert.equal(mailer.provider, "resend");
  });

  it("reports unconfigured when no SMTP or Resend credentials exist", async () => {
    const mailer = createMailer({ configured: false }, { configured: false });
    assert.equal(mailer.isConfigured, false);
    assert.equal(mailer.provider, "none");
    const res = await mailer.sendPasswordResetEmail({
      to: "patient@test.com",
      name: "Patient",
      token: "123456",
    });
    assert.equal(res.sent, false);
    assert.equal(res.reason, "SMTP_NOT_CONFIGURED");
  });
});
