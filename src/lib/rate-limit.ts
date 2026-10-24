import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fixed-window limiter backed by the database (see migration 20261026000000_security.sql).
 * Returns true when the call may proceed. Fails OPEN if the limiter itself errors: an outage there must not lock everyone out
 * (the providers' own limits and the daily budgets still apply). Keys are hashed, so no email or IP is stored in clear.
 */
export async function allow(parts: string[], max: number, windowSeconds: number): Promise<boolean> {
  const key = createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
  try {
    const { data, error } = await createAdminClient().rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
    if (error) throw new Error(error.message);
    return data === true;
  } catch (e) {
    console.error("rate-limit unavailable:", e instanceof Error ? e.message : "unknown");
    return true;
  }
}

/** Client IP as set by the hosting proxy (Vercel overwrites x-forwarded-for). First hop only. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}
