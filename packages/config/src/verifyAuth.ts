/**
 * Shared between apps/web's chat route and the CLI's `frontdesk verify`.
 * A request carrying a valid VERIFY_TOKEN is recognized as verify traffic,
 * not a real visitor: it gets its own small rate-limit namespace and a
 * mock-provider answer instead of a real Gemini call, so running verify
 * repeatedly never eats into the public daily chat quota. See
 * docs/DESIGN_NOTES.md ("Gate 3 can be starved by the same daily chat quota
 * gate 12 spends", fixed in round 4).
 */
export const VERIFY_TOKEN_HEADER = "x-verify-token";

/**
 * Only honored when VERIFY_TOKEN_HEADER is also present and valid - lets
 * gate 12 exercise the real public per-IP scope and limit under an isolated
 * synthetic key instead of the verify runner's real IP, so it proves the
 * same limit a real visitor would hit without spending a real visitor's
 * rate-limit window.
 */
export const VERIFY_RATE_LIMIT_KEY_HEADER = "x-verify-rate-limit-key";
