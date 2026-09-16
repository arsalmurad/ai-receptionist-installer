/**
 * Minimal Twilio REST client for the one thing frontdesk provision needs:
 * pointing a phone number's Voice URL and Voice Fallback URL at this
 * install. Built from https://www.twilio.com/docs/voice/api/incoming-phone-number-resource.
 * Never called unless TWILIO_ACCOUNT_SID is set - see docs/DESIGN_NOTES.md
 * ("no Twilio account" constraint).
 */

const BASE_URL = "https://api.twilio.com/2010-04-01";

function authHeader(accountSid: string, authToken: string): string {
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
}

export interface IncomingPhoneNumber {
  sid: string;
  phone_number: string;
  voice_url: string | null;
  voice_fallback_url: string | null;
}

export async function getIncomingPhoneNumber(
  accountSid: string,
  authToken: string,
  phoneNumberSid: string,
): Promise<IncomingPhoneNumber> {
  const res = await fetch(
    `${BASE_URL}/Accounts/${accountSid}/IncomingPhoneNumbers/${phoneNumberSid}.json`,
    { headers: { authorization: authHeader(accountSid, authToken) } },
  );
  if (!res.ok) {
    throw new Error(`Twilio getIncomingPhoneNumber failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<IncomingPhoneNumber>;
}

export interface UpdateVoiceUrlsInput {
  voiceUrl: string;
  voiceFallbackUrl: string;
}

export async function updateIncomingPhoneNumberVoiceUrls(
  accountSid: string,
  authToken: string,
  phoneNumberSid: string,
  input: UpdateVoiceUrlsInput,
): Promise<IncomingPhoneNumber> {
  const body = new URLSearchParams({
    VoiceUrl: input.voiceUrl,
    VoiceMethod: "POST",
    VoiceFallbackUrl: input.voiceFallbackUrl,
    VoiceFallbackMethod: "POST",
    StatusCallback: input.voiceUrl.replace(/\/incoming$/, "/status-callback"),
    StatusCallbackMethod: "POST",
  });

  const res = await fetch(
    `${BASE_URL}/Accounts/${accountSid}/IncomingPhoneNumbers/${phoneNumberSid}.json`,
    {
      method: "POST",
      headers: {
        authorization: authHeader(accountSid, authToken),
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  if (!res.ok) {
    throw new Error(`Twilio updateIncomingPhoneNumberVoiceUrls failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<IncomingPhoneNumber>;
}
