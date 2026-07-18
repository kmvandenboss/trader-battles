import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Integrations" };

export default function IntegrationsPage() {
  return (
    <PagePlaceholder
      title="Integrations"
      description="Future connections to trading platforms (NinjaTrader, Tradovate, Rithmic). This demo runs entirely on simulated data."
      comingSoon
    />
  );
}
