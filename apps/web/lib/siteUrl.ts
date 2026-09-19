/**
 * Absolute site URL for canonical tags, Open Graph/Twitter metadata,
 * sitemap.xml, and JSON-LD. Falls back to localhost so these still render
 * (with an obviously-local URL) in dev and demo mode, where
 * NEXT_PUBLIC_SITE_URL is normally unset.
 */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
