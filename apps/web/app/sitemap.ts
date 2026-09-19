import type { MetadataRoute } from "next";
import { clientConfig } from "@/lib/clientConfig";
import { getSiteUrl } from "@/lib/siteUrl";

/**
 * Next.js App Router convention: this file's default export becomes
 * /sitemap.xml automatically. A demo install only lists the one page meant
 * to stay indexable; a real install lists every real page.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();

  if (clientConfig.demo) {
    return [{ url: `${siteUrl}/about-this-demo`, lastModified: new Date() }];
  }

  return [
    { url: siteUrl, lastModified: new Date(), priority: 1 },
  ];
}
