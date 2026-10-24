"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { collectReceivable, computePortfolio, estimateUnits, priceFor, setManualValue } from "@/lib/calc";
import { loadData } from "@/lib/data";
import { parseDecimal, todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ASSET_CLASSES, TX_TYPES } from "@/lib/types";

// Every action: authenticate, validate server-side, write through the user's client (RLS applies).
// Errors are returned as message keys (translated by the UI), never as raw database text.
export type ActionResult = { ok: true } | { ok: false; error: string };

async function authed() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("unauthenticated");
  return { supabase, userId: data.user.id };
}

const done = (): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true };
};
const fail = (error: string): ActionResult => ({ ok: false, error });

// Form text -> number | null. Empty string means "not provided".
const num = z.string().optional().transform((s) => parseDecimal(s));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d)));
const optText = z.string().trim().max(200).optional().transform((s) => s || null);

/* ------------------------------ assets ------------------------------ */

const assetSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  class: z.enum(ASSET_CLASSES),
  platform: optText,
  color: optText,
  groupLabel: optText,
  monthlyContribution: num,
  initialInvested: num,
  initialUnits: num,
  manualPrice: num,
  manualValue: num,
});

export async function saveAsset(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await authed();
  const parsed = assetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("error.invalid");
  const v = parsed.data;
  if ([v.monthlyContribution, v.initialInvested, v.initialUnits, v.manualPrice, v.manualValue].some((n) => n !== null && n < 0)) return fail("error.invalid");

  const row = {
    name: v.name, class: v.class, platform: v.platform, color: v.color, group_label: v.groupLabel,
    monthly_contribution: v.monthlyContribution ?? 0, initial_invested: v.initialInvested ?? 0, initial_units: v.initialUnits ?? 0,
    manual_price: v.manualPrice, manual_value: v.manualValue ?? 0,
  };

  if (!v.id) {
    const { error } = await supabase.from("assets").insert({ ...row, user_id: userId, manual_value_at: todayIso() });
    return error ? fail("error.save") : done();
  }
  // Changing the manual value restarts the "PACs after this date" window (handoff section 5).
  const { data: old } = await supabase.from("assets").select("manual_value, manual_value_at").eq("id", v.id).single();
  if (!old) return fail("error.notFound");
  const changed = Number(old.manual_value) !== row.manual_value || !old.manual_value_at;
  const { error } = await supabase.from("assets").update({ ...row, manual_value_at: changed ? todayIso() : old.manual_value_at }).eq("id", v.id);
  return error ? fail("error.save") : done();
}

export async function deleteAsset(id: string): Promise<ActionResult> {
  const { supabase } = await authed();
  const { error } = await supabase.from("assets").delete().eq("id", z.string().uuid().parse(id));
  return error ? fail("error.save") : done();
}

/** Quick edit from the portfolio list: a new price, or a new manual value copied from the broker app. */
export async function quickUpdate(id: string, field: "price" | "value", text: string): Promise<ActionResult> {
  const { supabase } = await authed();
  const value = parseDecimal(text);
  if (value === null || value < 0) return fail("error.invalid");
  const patch = field === "price" ? { manual_price: value } : (() => { const m = setManualValue(value, todayIso()); return { manual_value: m.manualValue, manual_value_at: m.manualValueAt }; })();
  const { error } = await supabase.from("assets").update(patch).eq("id", z.string().uuid().parse(id));
  return error ? fail("error.save") : done();
}

export async function collectReceivableAction(receivableId: string, targetId: string): Promise<ActionResult> {
  const { supabase } = await authed();
  const data = await loadData(supabase);
  const rows = computePortfolio(data.assets, data.transactions, data.prices).rows;
  const receivable = rows.find((r) => r.id === receivableId);
  const target = rows.find((r) => r.id === targetId);
  if (!receivable || !target) return fail("error.notFound");
  let plan;
  try {
    plan = collectReceivable(receivable, target, todayIso());
  } catch {
    return fail("error.invalid");
  }
  const { error } = await supabase.from("assets").update({ manual_value: plan.targetPatch.manualValue, manual_value_at: plan.targetPatch.manualValueAt }).eq("id", target.id);
  if (error) return fail("error.save");
  const del = await supabase.from("assets").delete().eq("id", plan.deleteId);
  return del.error ? fail("error.save") : done();
}

/* --------------------------- transactions --------------------------- */

const txSchema = z.object({
  id: z.string().uuid().optional(),
  date: isoDate,
  type: z.enum(TX_TYPES),
  category: optText,
  description: optText,
  amount: num,
  assetId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  units: num,
});

export async function saveTransaction(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await authed();
  const parsed = txSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("error.invalid");
  const v = parsed.data;
  if (v.amount === null || v.amount <= 0) return fail("error.amountPositive");
  if (v.units !== null && v.units <= 0) return fail("error.invalid");

  const isInvestment = v.type === "pac" || v.type === "lump_sum";
  let units = isInvestment ? v.units : null;
  let unitsEstimated = false;

  // PAC without units on a priced asset: estimate amount / price (flagged so the UI can show "stimato").
  if (isInvestment && v.assetId && units === null) {
    const data = await loadData(supabase);
    const asset = data.assets.find((a) => a.id === v.assetId);
    const est = asset ? estimateUnits(v.amount, priceFor(asset, data.prices)) : null;
    if (est !== null) {
      units = est;
      unitsEstimated = true;
    }
  }

  const row = {
    date: v.date, type: v.type, category: v.category, description: v.description, amount: v.amount,
    asset_id: isInvestment ? v.assetId ?? null : null, units, units_estimated: unitsEstimated,
  };
  const { error } = v.id
    ? await supabase.from("transactions").update(row).eq("id", v.id)
    : await supabase.from("transactions").insert({ ...row, user_id: userId });
  return error ? fail("error.save") : done();
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const { supabase } = await authed();
  const { error } = await supabase.from("transactions").delete().eq("id", z.string().uuid().parse(id));
  return error ? fail("error.save") : done();
}

/* ----------------------------- snapshots ---------------------------- */

export async function saveSnapshot(): Promise<ActionResult> {
  const { supabase, userId } = await authed();
  const data = await loadData(supabase);
  const p = computePortfolio(data.assets, data.transactions, data.prices);
  const r = (n: number) => Math.round(n * 100) / 100;
  // One per day: saving again the same day overwrites (unique user_id + date).
  const { error } = await supabase.from("snapshots").upsert(
    { user_id: userId, date: todayIso(), net_worth: r(p.netWorth), liquidity: r(p.liquidity), invested: r(p.invested), crypto: r(p.crypto), receivables: r(p.receivables), source: "manual" },
    { onConflict: "user_id,date" },
  );
  return error ? fail("error.save") : done();
}
