import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Match History" };

export default function HistoryPage() {
  return (
    <PagePlaceholder
      title="Match History"
      description="Every past battle — results, score breakdowns, rating movement, and full reviews."
    />
  );
}
