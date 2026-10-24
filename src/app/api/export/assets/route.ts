import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { loadData } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { ASSET_CSV_HEADER } from "@/lib/import";
import { createClient } from "@/lib/supabase/server";

// Assets as CSV, in the exact format the CSV import reads back (see lib/import.ts). Price-feed links are not included.
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse(null, { status: 401 });

  const data = await loadData(supabase);
  const rows = data.assets.map((a) => [
    a.name, a.class, a.platform, a.color, a.groupLabel, a.monthlyContribution, a.initialInvested, a.initialUnits, a.manualPrice, a.manualValue, a.manualValueAt, a.archived ? "true" : "false",
  ]);
  return new NextResponse(toCsv([...ASSET_CSV_HEADER], rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="assets-${todayIso()}.csv"`, "Cache-Control": "no-store" },
  });
}
