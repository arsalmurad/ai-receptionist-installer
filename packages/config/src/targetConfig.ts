import { z } from "zod";

/**
 * Shape of a `frontdesk check --target <file.json>` config. Describes one
 * live AI receptionist install by URL plus whichever vendor credentials the
 * caller has - every credential block is optional, and each check that
 * needs one skips itself (not a FAIL) when it's missing. This is what makes
 * `frontdesk check` usable against any install that follows this project's
 * conventions (consent gate, ElevenLabs voice agent, Twilio voice webhook),
 * not only ones provisioned by this exact repo.
 */
export const targetConfigSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  /** Extra paths (beyond "/") to check return 200 - see gate "pages load". */
  extraPaths: z.array(z.string()).optional(),
  /** Expected to appear in every page's <title>, e.g. the business name - used by the SEO gate. */
  expectedTitleContains: z.string().optional(),
  verifyToken: z.string().optional(),
  chatRateLimitPerIp: z.number().int().positive().optional(),
  twilio: z
    .object({
      authToken: z.string(),
      accountSid: z.string().optional(),
      phoneNumberSid: z.string().optional(),
      fallbackTwimlUrl: z.string().url().optional(),
    })
    .optional(),
  elevenLabs: z
    .object({
      apiKey: z.string(),
      agentId: z.string(),
    })
    .optional(),
  resend: z
    .object({
      apiKey: z.string(),
      fromDomain: z.string(),
    })
    .optional(),
  /** Names and/or literal values that must never appear in the deployed client bundle. */
  secrets: z
    .object({
      names: z.array(z.string()).optional(),
      values: z.array(z.string()).optional(),
    })
    .optional(),
});

export type TargetConfig = z.infer<typeof targetConfigSchema>;
