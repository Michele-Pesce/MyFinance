import { FireCalculator } from "@/components/fire-client";
import { averageAnnualExpenses, computePortfolio } from "@/lib/calc";
import { loadData } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

// Defaults come from the user's data; the form (client) lets them change every assumption.
export default async function FirePage() {
  const data = await loadData(await createClient());
  const p = computePortfolio(data.assets, data.transactions, data.prices);
  return <div className="view"><FireCalculator d={{ invested: p.invested, crypto: p.crypto, liquidity: p.liquidity, expenses: averageAnnualExpenses(data.transactions, todayIso()), monthly: p.monthlyPac }} /></div>;
}
