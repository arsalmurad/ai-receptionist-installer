import Link from "next/link";

export function DemoBanner() {
  return (
    <div className="demo-banner">
      Demo install for a fictional business. This site was set up and checked by{" "}
      <Link href="/about-this-demo">ai-receptionist-installer</Link>.
    </div>
  );
}
