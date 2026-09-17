import type { Metadata } from "next";
import { clientConfig } from "@/lib/clientConfig";
import { DemoBanner } from "./components/DemoBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: clientConfig.businessName,
  description: `${clientConfig.businessName} - book service, ask questions, or call for emergencies.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
