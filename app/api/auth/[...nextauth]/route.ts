/**
 * Auth.js (NextAuth v5) route handlers — part of the temporary identity
 * bridge (lib/auth). Serves the credentials sign-in/sign-out endpoints on a
 * database-backed deployment; 404s in demo mode (no DATABASE_URL/AUTH_SECRET)
 * instead of surfacing Auth.js configuration errors.
 */

import type { NextRequest } from "next/server";

import { handlers } from "@/lib/auth";
import { isAuthEnabled } from "@/lib/auth/db";

function guard(handler: (req: NextRequest) => Promise<Response>) {
  return (req: NextRequest): Promise<Response> =>
    isAuthEnabled()
      ? handler(req)
      : Promise.resolve(new Response("Not Found", { status: 404 }));
}

export const GET = guard(handlers.GET);
export const POST = guard(handlers.POST);
