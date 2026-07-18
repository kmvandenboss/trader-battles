import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Trader Profile" };

export default function ProfilePage() {
  return (
    <PagePlaceholder
      title="Trader Profile"
      description="Your competitive identity — rating trend, badges, style profile, and season statistics."
    />
  );
}
