/**
 * /profile — the pre-authenticated demo user's competitive profile (KevinV).
 * Server component: reads an already-computed ProfileViewModel through the
 * repositories (loadDemoProfile) and renders the shared TraderProfileView.
 */

import type { Metadata } from "next";
import { loadDemoProfile } from "@/components/profile/profile";
import { TraderProfileView } from "@/components/profile/trader-profile-view";

export const metadata: Metadata = {
  title: "Trader Profile",
  description:
    "Your competitive identity — rating trend, competitive skill indicators, achievements, records, and recent battles. Simulated demo data.",
};

export default async function ProfilePage() {
  const view = await loadDemoProfile();
  if (!view) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        Profile is unavailable.
      </p>
    );
  }
  return <TraderProfileView view={view} />;
}
