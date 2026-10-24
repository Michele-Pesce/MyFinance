import { NextResponse } from "next/server";
import { buildBackup } from "@/lib/backup";
import { loadData } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

// Full backup of the signed-in user (also the restore format). Never cached.
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse(null, { status: 401 });
  const body = JSON.stringify(buildBackup(await loadData(supabase)), null, 2);
  return new NextResponse(body, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="myfinance-backup-${todayIso()}.json"`, "Cache-Control": "no-store" },
  });
}
