/**
 * Minimal Resend client. Send-only, per the build spec - no inbound/receiving
 * is built. Domain status check is used by frontdesk verify (gate 7) and by
 * fleet doctor to catch DNS drift - see RESEARCH.md 6.1.
 */

const BASE_URL = "https://api.resend.com";

export interface ResendDomain {
  id: string;
  name: string;
  status: string;
}

export async function listDomains(apiKey: string): Promise<ResendDomain[]> {
  const res = await fetch(`${BASE_URL}/domains`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Resend listDomains failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { data: ResendDomain[] };
  return data.data;
}

export async function getDomainStatusByName(apiKey: string, domainName: string): Promise<ResendDomain | undefined> {
  const domains = await listDomains(apiKey);
  return domains.find((d) => d.name === domainName);
}

export interface SendEmailInput {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(apiKey: string, input: SendEmailInput): Promise<{ id: string }> {
  const res = await fetch(`${BASE_URL}/emails`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Resend sendEmail failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ id: string }>;
}
