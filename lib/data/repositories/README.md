# Repositories

Swappable data-access layer. The demo serves deterministic TypeScript seed
data through these repository interfaces; a real Postgres (via the Drizzle
schema) drops in behind the same interfaces later without touching scoring,
battles, or UI.

Will contain (Phase 2): repository interfaces + in-memory/seed-backed
implementations for traders, firms, battles, ratings, leaderboards,
notifications.
