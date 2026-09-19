import type { MetadataRoute } from "next";
import { clientConfig } from "@/lib/clientConfig";
import { getSiteUrl } from "@/lib/siteUrl";

/**
 * Next.js App Router convention: this file's default export becomes
 * /robots.txt automatically. A demo install disallows everything except
 * /about-this-demo, since the rest of the site is a fictional business -
 * see README "SEO" and clientConfig.demo.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  if (clientConfig.demo) {
    return {
      rules: [
        { userAgent: "*", allow: "/about-this-demo", disallow: "/" },
      ],
      sitemap: `${siteUrl}/sitemap.xml`,
    };
  }

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/api"] }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
