/**
 * /profile/[userId] — any seeded trader's competitive profile. Server
 * component: reads an already-computed ProfileViewModel through the
 * repositories (loadTraderProfile) and renders the shared TraderProfileView.
 * Unknown user ids 404.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadTraderProfile } from "@/components/profile/profile";
import { TraderProfileView } from "@/components/profile/trader-profile-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  const { userId } = await params;
  const view = await loadTraderProfile(userId);
  return {
    title: view ? `${view.displayName} · Profile` : "Trader Profile",
    description:
      "Competitive trader profile — rating trend, skill indicators, achievements, and recent battles. Simulated demo data.",
  };
}

export default async function TraderProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const view = await loadTraderProfile(userId);
  if (!view) notFound();
  return <TraderProfileView view={view} />;
}
