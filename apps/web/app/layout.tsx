import type { Metadata } from "next";
import { buildLocalBusinessJsonLd, buildMetaDescription } from "@frontdesk-kit/config";
import { clientConfig } from "@/lib/clientConfig";
import { getSiteUrl } from "@/lib/siteUrl";
import { DemoBanner } from "./components/DemoBanner";
import "./globals.css";

const siteUrl = getSiteUrl();
const description = buildMetaDescription(clientConfig);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: clientConfig.businessName,
    template: `%s | ${clientConfig.businessName}`,
  },
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: clientConfig.businessName,
    description,
    url: siteUrl,
    siteName: clientConfig.businessName,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: clientConfig.businessName,
    description,
  },
  // Demo installs (clientConfig.demo) must not be indexed - this is a
  // fictional business, not a real one. /about-this-demo overrides this
  // back to indexable in its own metadata export - see README "SEO".
  robots: clientConfig.demo ? { index: false, follow: false } : { index: true, follow: true },
};

const localBusinessJsonLd = buildLocalBusinessJsonLd(clientConfig, siteUrl);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Static JSON-LD we generated from client config, not user input. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }} />
        {clientConfig.demo && <DemoBanner />}
        {children}
      </body>
    </html>
  );
}
