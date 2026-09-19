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

/** schema.org PostalAddress fields - see https://schema.org/PostalAddress. Optional: only used for LocalBusiness JSON-LD, and Google's rich-results eligibility needs it, but schema.org itself does not require it. */
export const addressSchema = z.object({
  streetAddress: z.string().min(1),
  addressLocality: z.string().min(1),
  addressRegion: z.string().min(1),
  postalCode: z.string().min(1),
  addressCountry: z.string().min(1),
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
  /** Street address for LocalBusiness JSON-LD. Optional - omitted from the JSON-LD entirely when not set. */
  address: addressSchema.optional(),
  /** Meta description override, 160 chars or fewer. Falls back to a generated one from businessName + serviceArea when unset. */
  seoDescription: z.string().min(1).max(160).optional(),
  /**
   * True only for this repo's own fictional demo install. Real client
   * installs must never set this - it hides the demo banner, 404s
   * /about-this-demo, and tells search engines not to index the site
   * (except /about-this-demo itself, which stays indexable). See
   * docs/DESIGN_NOTES.md and README "SEO".
   */
  demo: z.boolean().optional(),
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
const SCOPE_INSTRUCTION = [
  "You are the front-desk assistant for the business described below.",
  "Answer only using the information given here. Never invent prices, availability, or booking confirmations.",
  "If the question asks for something not covered below (an exact price when prices are not listed, a specific booking, or anything you are not told), respond with exactly the single word OUT_OF_SCOPE and nothing else.",
].join(" ");

export function buildSystemPrompt(config: ClientConfig): string {
  return `${SCOPE_INSTRUCTION}\n\n${buildGroundingText(config)}`;
}

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
