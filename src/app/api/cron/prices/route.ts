import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runPriceUpdate } from "@/lib/prices/run";
import { buildProviders, runAutoSnapshots, supabaseStore } from "@/lib/prices/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Daily job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`): refresh prices, then store today's auto snapshots.
// Response and logs carry counts only, never prices or amounts.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok = !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return new NextResponse(null, { status: 401 });

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  try {
    const prices = await runPriceUpdate({ providers: buildProviders(), store: supabaseStore(admin), today });
    // Snapshots run even when some prices are missing: the last known price is used and the UI shows its age.
    const snapshots = await runAutoSnapshots(admin, today);
    return NextResponse.json({ prices, snapshots });
  } catch (e) {
    console.error("cron/prices failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
