import type { ClientConfig } from "./clientConfig";

/**
 * Per-client SEO metadata, generated from clients/<id>/config.json so an
 * agency never has to hand-write meta tags per install. LocalBusiness
 * JSON-LD shape checked against https://schema.org/LocalBusiness and
 * Google's structured data guidelines
 * (https://developers.google.com/search/docs/appearance/structured-data/local-business):
 * name + address are what Google requires for rich-results eligibility;
 * telephone, url, and openingHoursSpecification are recommended. address is
 * optional in ClientConfig, so it is simply omitted from the JSON-LD (still
 * valid schema.org, just not rich-results-eligible) when a client has not
 * set one yet.
 */

const DAY_TO_SCHEMA: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export function buildMetaDescription(config: ClientConfig): string {
  if (config.seoDescription) return config.seoDescription;
  const area = config.serviceArea.slice(0, 3).join(", ");
  const description = `${config.businessName} serves ${area}. Call, chat, or book online for ${config.services
    .slice(0, 2)
    .map((s) => s.name.toLowerCase())
    .join(" and ")}.`;
  return description.length > 160 ? `${description.slice(0, 157)}...` : description;
}

export interface LocalBusinessJsonLd {
  "@context": "https://schema.org";
  "@type": "LocalBusiness";
  name: string;
  url: string;
  telephone: string;
  areaServed: string[];
  openingHoursSpecification: Array<{
    "@type": "OpeningHoursSpecification";
    dayOfWeek: string;
    opens: string;
    closes: string;
  }>;
  address?: {
    "@type": "PostalAddress";
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    postalCode: string;
    addressCountry: string;
  };
}

export function buildLocalBusinessJsonLd(config: ClientConfig, siteUrl: string): LocalBusinessJsonLd {
  const openingHoursSpecification = config.hours
    .filter((h) => h.open && h.close)
    .map((h) => ({
      "@type": "OpeningHoursSpecification" as const,
      dayOfWeek: DAY_TO_SCHEMA[h.day] ?? h.day,
      opens: h.open as string,
      closes: h.close as string,
    }));

  const jsonLd: LocalBusinessJsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: config.businessName,
    url: siteUrl,
    telephone: config.phoneDisplay,
    areaServed: config.serviceArea,
    openingHoursSpecification,
  };

  if (config.address) {
    jsonLd.address = {
      "@type": "PostalAddress",
      streetAddress: config.address.streetAddress,
      addressLocality: config.address.addressLocality,
      addressRegion: config.address.addressRegion,
      postalCode: config.address.postalCode,
      addressCountry: config.address.addressCountry,
    };
  }

  return jsonLd;
}
