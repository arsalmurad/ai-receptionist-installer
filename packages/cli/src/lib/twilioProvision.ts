import {
  getIncomingPhoneNumber,
  updateIncomingPhoneNumberVoiceUrls,
  type IncomingPhoneNumber,
} from "@frontdesk-kit/config";

export interface TwilioDesiredUrls {
  voiceUrl: string;
  voiceFallbackUrl: string;
}

/** Pure idempotency check, unit tested without any network access. */
export function needsTwilioUpdate(current: IncomingPhoneNumber, desired: TwilioDesiredUrls): boolean {
  return current.voice_url !== desired.voiceUrl || current.voice_fallback_url !== desired.voiceFallbackUrl;
}

export async function ensureTwilioVoiceUrls(
  accountSid: string,
  authToken: string,
  phoneNumberSid: string,
  desired: TwilioDesiredUrls,
): Promise<{ changed: boolean; number: IncomingPhoneNumber }> {
  const current = await getIncomingPhoneNumber(accountSid, authToken, phoneNumberSid);
  if (!needsTwilioUpdate(current, desired)) {
    return { changed: false, number: current };
  }
  const updated = await updateIncomingPhoneNumberVoiceUrls(accountSid, authToken, phoneNumberSid, desired);
  return { changed: true, number: updated };
}

/**
 * voiceFallbackUrl must be the Twilio TwiML Bin URL from
 * docs/FALLBACK_TWIML.md (created manually in the Twilio console - see
 * RUNBOOK.md), not one of our own routes. It only runs when our own
 * VoiceUrl fails to answer at all, so it cannot depend on our app being up.
 */
export function buildDesiredUrls(siteUrl: string, fallbackTwimlUrl: string): TwilioDesiredUrls {
  const base = siteUrl.replace(/\/$/, "");
  return {
    voiceUrl: `${base}/api/voice/incoming`,
    voiceFallbackUrl: fallbackTwimlUrl,
  };
}
