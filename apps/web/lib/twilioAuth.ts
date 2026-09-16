import { validateTwilioSignature, TWILIO_SIGNATURE_HEADER } from "@frontdesk-kit/config";

export interface TwilioVerification {
  valid: boolean;
  params: Record<string, string>;
}

export async function verifyTwilioRequest(request: Request, authToken: string): Promise<TwilioVerification> {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    params[key] = String(value);
  }

  const signature = request.headers.get(TWILIO_SIGNATURE_HEADER);
  const valid = await validateTwilioSignature(authToken, request.url, params, signature);
  return { valid, params };
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
