/**
 * Safe-harbor disclosure wording, per RESEARCH.md section 3.4. One sentence
 * that simultaneously satisfies Utah's regulated-occupation duty, California's
 * BOTS act, Maine's aural-bot law, and all-party call-recording consent -
 * see docs/DESIGN_NOTES.md.
 */
export function buildVoiceDisclosureLine(businessName: string): string {
  return `Hi, thanks for calling ${businessName}. I am their AI receptionist on a recorded line. How can I help you today?`;
}

export function buildChatDisclosureLine(businessName: string): string {
  return `${businessName} uses an AI assistant to answer questions here. This is not a human and the conversation may be reviewed.`;
}
