import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { loadData } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

// Transactions as CSV: ';' separator, UTF-8 BOM, decimal comma (opens cleanly in Italian Excel).
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse(null, { status: 401 });

  const data = await loadData(supabase);
  const name = (id?: string | null) => data.assets.find((a) => a.id === id)?.name ?? "";
  const rows = [...data.transactions].sort((a, b) => (a.date < b.date ? -1 : 1)).map((x) =>
    [x.date, x.type, x.category, x.description, x.amount, name(x.assetId), x.units]);
  const csv = toCsv(["date", "type", "category", "description", "amount", "asset", "units"], rows);

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="transactions-${todayIso()}.csv"`, "Cache-Control": "no-store" },
  });
}
