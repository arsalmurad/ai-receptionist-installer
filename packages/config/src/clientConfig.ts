import { z } from "zod";

export const businessHoursSchema = z.object({
  day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  open: z.string().regex(/^\d{2}:\d{2}$/, "use HH:MM 24h format").nullable(),
  close: z.string().regex(/^\d{2}:\d{2}$/, "use HH:MM 24h format").nullable(),
});

export const faqEntrySchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const serviceSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});

export const emergencyRuleSchema = z.object({
  keyword: z.string().min(1),
  instruction: z.string().min(1),
});

export const clientConfigSchema = z.object({
  clientId: z.string().min(1),
  businessName: z.string().min(1),
  timezone: z.string().min(1),
  phoneDisplay: z.string().min(1),
  hours: z.array(businessHoursSchema).min(1),
  services: z.array(serviceSchema).min(1),
  serviceArea: z.array(z.string().min(1)).min(1),
  pricesPolicy: z.object({
    listedPrices: z.boolean(),
    note: z.string().min(1),
  }),
  faq: z.array(faqEntrySchema),
  emergencyRules: z.array(emergencyRuleSchema),
  ownerNotificationEmail: z.string().email(),
  disclosureVersion: z.string().min(1),
});

export type ClientConfig = z.infer<typeof clientConfigSchema>;

export class ClientConfigValidationError extends Error {
  constructor(public clientId: string, public issues: z.ZodIssue[]) {
    const lines = issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
    super(`Invalid client config for "${clientId}":\n${lines.join("\n")}`);
    this.name = "ClientConfigValidationError";
  }
}

export function parseClientConfig(clientId: string, raw: unknown): ClientConfig {
  const result = clientConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new ClientConfigValidationError(clientId, result.error.issues);
  }
  return result.data;
}

/**
 * Builds the text block the LLM (mock, gemini, or openai) is grounded with.
 * Nothing outside this text should be presented as fact - see RESEARCH.md
 * section 1.4 (fact degradation) and 1.5 (resolution illusion), cited in
 * docs/DESIGN_NOTES.md.
 */
export function buildGroundingText(config: ClientConfig): string {
  const hoursText = config.hours
    .map((h) => `${h.day}: ${h.open && h.close ? `${h.open}-${h.close}` : "closed"}`)
    .join(", ");
  const servicesText = config.services.map((s) => `${s.name} - ${s.description}`).join("\n");
  const faqText = config.faq.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n");
  const emergencyText = config.emergencyRules
    .map((r) => `If the caller mentions "${r.keyword}": ${r.instruction}`)
    .join("\n");

  return [
    `Business: ${config.businessName}`,
    `Hours: ${hoursText}`,
    `Service area: ${config.serviceArea.join(", ")}`,
    `Services:\n${servicesText}`,
    `Prices policy: ${config.pricesPolicy.note}`,
    config.faq.length ? `FAQ:\n${faqText}` : "",
    config.emergencyRules.length ? `Emergency handling:\n${emergencyText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
