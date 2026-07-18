import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Leagues" };

export default function LeaguesPage() {
  return (
    <PagePlaceholder
      title="Leagues"
      description="The ladder from Bronze to Legend — divisions, promotion, and season structure."
    />
  );
}
