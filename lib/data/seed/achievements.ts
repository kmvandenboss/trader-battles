/**
 * Achievement catalog (authored, deterministic).
 *
 * Modest, non-cartoonish achievements reinforcing participation, discipline,
 * improvement, competitive success, and market specialization
 * (docs/PRODUCT_BRIEF.md "Badges and Achievements").
 */

import type { Achievement } from "../schema/types";

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "ach-first-victory",
    name: "First Victory",
    description: "Win your first battle.",
    category: "PARTICIPATION",
    icon: "trophy",
  },
  {
    id: "ach-ten-battles",
    name: "Ten Battles Completed",
    description: "Complete ten battles in any league.",
    category: "PARTICIPATION",
    icon: "swords",
  },
  {
    id: "ach-five-win-streak",
    name: "Five-Win Streak",
    description: "Win five battles in a row.",
    category: "COMPETITIVE_SUCCESS",
    icon: "flame",
  },
  {
    id: "ach-gold-league",
    name: "Gold League Reached",
    description: "Reach the Gold league.",
    category: "IMPROVEMENT",
    icon: "medal",
  },
  {
    id: "ach-risk-manager",
    name: "Risk Manager",
    description:
      "Win a battle while using less than half of your permitted drawdown.",
    category: "DISCIPLINE",
    icon: "shield",
  },
  {
    id: "ach-opening-bell",
    name: "Opening Bell Specialist",
    description: "Win five Opening Bell battles in a single season.",
    category: "MARKET_SPECIALIZATION",
    icon: "alarm-clock",
  },
  {
    id: "ach-nq-contender",
    name: "NQ Contender",
    description: "Win ten NQ battles.",
    category: "MARKET_SPECIALIZATION",
    icon: "activity",
  },
  {
    id: "ach-comeback-win",
    name: "Comeback Win",
    description: "Win a battle after trailing by ten or more score points.",
    category: "COMPETITIVE_SUCCESS",
    icon: "trending-up",
  },
  {
    id: "ach-clean-battle",
    name: "Clean Battle",
    description: "Complete a battle with zero rule violations.",
    category: "DISCIPLINE",
    icon: "check-circle",
  },
  {
    id: "ach-giant-slayer",
    name: "Giant Slayer",
    description: "Defeat an opponent rated 100 or more points above you.",
    category: "COMPETITIVE_SUCCESS",
    icon: "sword",
  },
];
