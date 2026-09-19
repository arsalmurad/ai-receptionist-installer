import { runGate, Fail } from "./gate";
import type { GateResult } from "./report";

function extractTag(html: string, pattern: RegExp): string | undefined {
  return html.match(pattern)?.[1]?.trim();
}

/**
 * Gate 13: proves the basics search engines and social previews actually
 * need are present, not just that the site loads. Used by both
 * `frontdesk verify` (against this repo's own client config) and
 * `frontdesk check --target` (against any install), since it only needs a
 * URL - see README "SEO".
 */
export async function checkSeoBasics(baseUrl: string, expectedTitleContains?: string): Promise<GateResult> {
  return runGate("13 SEO basics", async () => {
    const homeRes = await fetch(baseUrl);
    if (!homeRes.ok) throw new Fail(`homepage returned ${homeRes.status}`);
    const homeHtml = await homeRes.text();

    const title = extractTag(homeHtml, /<title>([^<]*)<\/title>/i);
    if (!title) throw new Fail("no <title> tag found");
    if (expectedTitleContains && !title.includes(expectedTitleContains)) {
      throw new Fail(`<title> "${title}" does not contain expected "${expectedTitleContains}"`);
    }

    const description = extractTag(homeHtml, /<meta\s+name="description"\s+content="([^"]*)"/i);
    if (!description) throw new Fail("no <meta name=\"description\"> tag found");

    const canonical = extractTag(homeHtml, /<link\s+rel="canonical"\s+href="([^"]*)"/i);
    if (!canonical) throw new Fail("no <link rel=\"canonical\"> tag found");

    const jsonLdRaw = extractTag(homeHtml, /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (!jsonLdRaw) throw new Fail("no <script type=\"application/ld+json\"> tag found");
    let jsonLd: Record<string, unknown>;
    try {
      jsonLd = JSON.parse(jsonLdRaw);
    } catch {
      throw new Fail("JSON-LD did not parse as valid JSON");
    }
    if (jsonLd["@context"] !== "https://schema.org") throw new Fail(`JSON-LD @context is "${jsonLd["@context"]}", expected "https://schema.org"`);
    if (typeof jsonLd["@type"] !== "string" || !jsonLd["@type"]) throw new Fail("JSON-LD is missing @type");
    if (typeof jsonLd.name !== "string" || !jsonLd.name) throw new Fail("JSON-LD is missing name");

    const sitemapRes = await fetch(`${baseUrl}/sitemap.xml`);
    if (!sitemapRes.ok) throw new Fail(`/sitemap.xml returned ${sitemapRes.status}`);

    const robotsRes = await fetch(`${baseUrl}/robots.txt`);
    if (!robotsRes.ok) throw new Fail(`/robots.txt returned ${robotsRes.status}`);

    // Uniqueness: only checkable when a second known page exists and is
    // reachable (a demo install's /about-this-demo). Not a failure when it
    // 404s - that just means there is nothing else on this install to
    // compare against.
    let uniquenessNote = "not checked (no second page reachable)";
    const secondRes = await fetch(`${baseUrl}/about-this-demo`);
    if (secondRes.ok) {
      const secondHtml = await secondRes.text();
      const secondTitle = extractTag(secondHtml, /<title>([^<]*)<\/title>/i);
      if (secondTitle && secondTitle === title) {
        throw new Fail(`homepage and /about-this-demo share the same <title> "${title}"`);
      }
      uniquenessNote = "title differs between / and /about-this-demo";
    }

    return `title and meta description present, canonical present, sitemap.xml and robots.txt reachable, JSON-LD parses with @type "${jsonLd["@type"]}" (${uniquenessNote})`;
  });
}
