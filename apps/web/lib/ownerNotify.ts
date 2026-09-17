import { sendEmail } from "@frontdesk-kit/config";
import { getEnv, getFeatureFlags } from "./env";
import { clientConfig } from "./clientConfig";
import { checkRateLimit } from "./rateLimit";

const DAILY_EMAIL_LIMIT = Number(process.env.OWNER_EMAIL_DAILY_CAP ?? 20);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Caps owner notification emails per day so a burst of demo traffic (or
 * abuse) cannot exhaust the Resend quota. The lead itself is always saved
 * regardless - only the email is skipped past the cap.
 */
async function underDailyEmailCap(): Promise<boolean> {
  const result = await checkRateLimit("owner_email_daily", clientConfig.clientId, DAY_MS, DAILY_EMAIL_LIMIT);
  return result.allowed;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

export type NotifyResult = { sent: true } | { sent: false; reason: string };

/**
 * Owner notifications are synchronous, structured, and sent while the
 * interaction is still fresh - RESEARCH.md 2.1 (contact within 5 minutes is
 * ~21x more likely to convert) and 2.3 (owners want a triaged summary, not a
 * raw transcript). If Resend is not configured, this reports itself as
 * skipped instead of throwing, per the build spec's optional-integration rule.
 */
export async function notifyOwnerOfLead(input: {
  source: "chat" | "voice";
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  message?: string | null;
}): Promise<NotifyResult> {
  const flags = getFeatureFlags();
  if (!flags.resend) return { sent: false, reason: "resend not configured" };
  if (!(await underDailyEmailCap())) return { sent: false, reason: "daily owner email cap reached" };

  const env = getEnv();
  const rows = [
    input.name ? `<li><strong>Name:</strong> ${escapeHtml(input.name)}</li>` : "",
    input.phone ? `<li><strong>Phone:</strong> ${escapeHtml(input.phone)}</li>` : "",
    input.email ? `<li><strong>Email:</strong> ${escapeHtml(input.email)}</li>` : "",
    input.message ? `<li><strong>Message:</strong> ${escapeHtml(input.message)}</li>` : "",
  ].join("");

  try {
    await sendEmail(env.RESEND_API_KEY as string, {
      from: `AI Front Desk <notify@${env.RESEND_FROM_DOMAIN}>`,
      to: clientConfig.ownerNotificationEmail,
      subject: `New ${input.source} lead - ${clientConfig.businessName}`,
      html: `<p>A new lead came in through the ${input.source} assistant and has not been contacted yet.</p><ul>${rows}</ul>`,
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: (error as Error).message };
  }
}

export async function notifyOwnerOfCall(input: {
  fromNumber: string | null;
  status: string;
}): Promise<NotifyResult> {
  const flags = getFeatureFlags();
  if (!flags.resend) return { sent: false, reason: "resend not configured" };
  if (!(await underDailyEmailCap())) return { sent: false, reason: "daily owner email cap reached" };

  const env = getEnv();
  try {
    await sendEmail(env.RESEND_API_KEY as string, {
      from: `AI Front Desk <notify@${env.RESEND_FROM_DOMAIN}>`,
      to: clientConfig.ownerNotificationEmail,
      subject: `Call ${input.status} - ${clientConfig.businessName}`,
      html: `<p>A call from ${escapeHtml(input.fromNumber ?? "an unknown number")} is now <strong>${escapeHtml(input.status)}</strong>. Check the dashboard for the transcript.</p>`,
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: (error as Error).message };
  }
}
