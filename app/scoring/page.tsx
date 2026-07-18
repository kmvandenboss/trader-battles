import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "How Scoring Works" };

export default function ScoringPage() {
  return (
    <PagePlaceholder
      title="How Scoring Works"
      description="Battles are scored on normalized performance, risk efficiency, discipline, and consistency — not raw dollars."
    />
  );
}
