import { OverviewView } from "@/components/overview";
import { loadData } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ alloc?: string; cat?: string }> }) {
  const { alloc = "asset", cat = "" } = await searchParams;
  return <OverviewView data={await loadData(await createClient())} alloc={alloc} cat={cat} />;
}
