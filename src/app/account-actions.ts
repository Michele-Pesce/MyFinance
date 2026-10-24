"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { backupSchema, backupToRows } from "@/lib/backup";
import type { AssetImportRow, ImportRow } from "@/lib/import";
import { allow } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ASSET_CLASSES, TX_TYPES } from "@/lib/types";
import type { ActionResult } from "./actions";

// Settings, import/restore, onboarding and account deletion. Same rules as actions.ts: authenticate, validate, RLS client.
export type CountResult = { ok: true; count: number } | { ok: false; error: string };

async function authed() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("unauthenticated");
  return { supabase, userId: data.user.id };
}
const refresh = () => revalidatePath("/", "layout");
const failed = (error: string): { ok: false; error: string } => ({ ok: false, error });

/* ---------------------------- categories ---------------------------- */

const catName = z.string().trim().min(1).max(100);

export async function addCategory(kind: "expense" | "income", name: string): Promise<ActionResult> {
  const { supabase, userId } = await authed();
  const n = catName.safeParse(name);
  if (!n.success || !["expense", "income"].includes(kind)) return failed("error.invalid");
  const { data: last } = await supabase.from("categories").select("sort").eq("kind", kind).order("sort", { ascending: false }).limit(1);
  const { error } = await supabase.from("categories").insert({ user_id: userId, kind, name: n.data, sort: (last?.[0]?.sort ?? 0) + 1 });
  if (error) return failed(error.code === "23505" ? "error.categoryExists" : "error.save");
  refresh();
  return { ok: true };
}

/** Transactions keep the category as text, so a rename also rewrites the matching transactions. */
export async function renameCategory(id: string, name: string): Promise<ActionResult> {
  const { supabase } = await authed();
  const n = catName.safeParse(name);
  const cid = z.string().uuid().safeParse(id);
  if (!n.success || !cid.success) return failed("error.invalid");
  const { data: old } = await supabase.from("categories").select("name, kind").eq("id", cid.data).single();
  if (!old) return failed("error.notFound");
  const { error } = await supabase.from("categories").update({ name: n.data }).eq("id", cid.data);
  if (error) return failed(error.code === "23505" ? "error.categoryExists" : "error.save");
  if (old.name !== n.data) await supabase.from("transactions").update({ category: n.data }).eq("category", old.name).eq("type", old.kind);
  refresh();
  return { ok: true };
}

/** Existing transactions keep their category text; only the choice in the form goes away. */
export async function deleteCategory(id: string): Promise<ActionResult> {
  const { supabase } = await authed();
  const { error } = await supabase.from("categories").delete().eq("id", z.string().uuid().parse(id));
  if (error) return failed("error.save");
  refresh();
  return { ok: true };
}

/* ------------------------------ import ------------------------------ */

const importRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), type: z.enum(TX_TYPES), category: z.string().max(200).nullable(), description: z.string().max(500).nullable(),
  amount: z.number().positive().finite(), assetName: z.string().max(100).nullable(), units: z.number().positive().finite().nullable(),
});

/** Rows come from the browser's preview (already parsed); they are validated again here. Asset names resolve to the user's own assets. */
export async function importTransactions(rows: ImportRow[]): Promise<CountResult> {
  const { supabase, userId } = await authed();
  if (!(await allow(["import", userId], 10, 3_600))) return failed("error.rateLimit");
  const parsed = z.array(importRowSchema).min(1).max(5000).safeParse(rows);
  if (!parsed.success) return failed("error.invalid");
  const { data: assets } = await supabase.from("assets").select("id, name");
  const byName = new Map((assets ?? []).map((a) => [a.name.trim().toLowerCase(), a.id as string]));
  const out = parsed.data.map((r) => ({
    user_id: userId, date: r.date, type: r.type, category: r.category, description: r.description, amount: r.amount,
    asset_id: r.assetName ? byName.get(r.assetName.toLowerCase()) ?? null : null, units: r.assetName ? r.units : null,
  }));
  for (let i = 0; i < out.length; i += 500) {
    const { error } = await supabase.from("transactions").insert(out.slice(i, i + 500));
    if (error) return failed("error.save");
  }
  refresh();
  return { ok: true, count: out.length };
}

const assetRowSchema = z.object({
  name: z.string().trim().min(1).max(100), class: z.enum(ASSET_CLASSES), platform: z.string().max(200).nullable(), color: z.string().max(20).nullable(), groupLabel: z.string().max(200).nullable(),
  monthlyContribution: z.number().min(0).finite(), initialInvested: z.number().finite(), initialUnits: z.number().finite(), manualPrice: z.number().finite().nullable(),
  manualValue: z.number().finite(), manualValueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), archived: z.boolean(),
});

/** Assets CSV (same format as the export). Names already in the account are skipped, so re-importing never duplicates. Returns the number created. */
export async function importAssets(rows: AssetImportRow[]): Promise<CountResult> {
  const { supabase, userId } = await authed();
  if (!(await allow(["import", userId], 10, 3_600))) return failed("error.rateLimit");
  const parsed = z.array(assetRowSchema).min(1).max(500).safeParse(rows);
  if (!parsed.success) return failed("error.invalid");
  const { data: existing } = await supabase.from("assets").select("name");
  const seen = new Set((existing ?? []).map((a) => a.name.trim().toLowerCase()));
  const fresh = parsed.data.filter((r) => {
    const k = r.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (fresh.length) {
    const { error } = await supabase.from("assets").insert(fresh.map((r) => ({
      user_id: userId, name: r.name, class: r.class, platform: r.platform, color: r.color, group_label: r.groupLabel, monthly_contribution: r.monthlyContribution,
      initial_invested: r.initialInvested, initial_units: r.initialUnits, manual_price: r.manualPrice, manual_value: r.manualValue, manual_value_at: r.manualValueAt, archived: r.archived,
    })));
    if (error) return failed("error.save");
  }
  refresh();
  return { ok: true, count: fresh.length };
}

/** Restore a JSON backup into an EMPTY account (re-importing into a filled one would duplicate everything). */
export async function restoreBackup(text: string): Promise<CountResult> {
  const { supabase, userId } = await authed();
  if (!(await allow(["restore", userId], 5, 3_600))) return failed("error.rateLimit");
  if (text.length > 8_000_000) return failed("error.invalid");
  let json: unknown;
  try { json = JSON.parse(text); } catch { return failed("error.invalid"); }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) return failed("error.invalid");

  const [a, t] = await Promise.all([
    supabase.from("assets").select("id", { count: "exact", head: true }),
    supabase.from("transactions").select("id", { count: "exact", head: true }),
  ]);
  if ((a.count ?? 0) > 0 || (t.count ?? 0) > 0) return failed("error.importNotEmpty");

  const rows = backupToRows(parsed.data, userId, randomUUID);
  const steps = [
    () => supabase.from("categories").upsert(rows.categories, { onConflict: "user_id,kind,name", ignoreDuplicates: true }),
    () => supabase.from("assets").insert(rows.assets),
    ...Array.from({ length: Math.ceil(rows.transactions.length / 500) }, (_, i) => () => supabase.from("transactions").insert(rows.transactions.slice(i * 500, i * 500 + 500))),
    () => supabase.from("snapshots").upsert(rows.snapshots, { onConflict: "user_id,date", ignoreDuplicates: true }),
  ];
  for (const step of steps) {
    const { error } = await step();
    if (error) return failed("error.save");
  }
  refresh();
  return { ok: true, count: rows.assets.length + rows.transactions.length + rows.snapshots.length };
}

/* ------------------------- account / onboarding ------------------------- */

/** Deletes the auth user; every table row follows through ON DELETE CASCADE. Needs the typed confirmation. */
export async function deleteAccount(confirmation: string): Promise<ActionResult> {
  const { supabase, userId } = await authed();
  if (confirmation.trim().toUpperCase() !== "ELIMINA") return failed("error.confirmText");
  const { error } = await createAdminClient().auth.admin.deleteUser(userId);
  if (error) return failed("error.save");
  await supabase.auth.signOut();
  redirect("/login");
}

const firstAsset = z.object({
  name: z.string().trim().min(1).max(100), class: z.enum(ASSET_CLASSES), value: z.string(),
});

/** Wizard: optional display name and first asset, then the profile is marked onboarded. Skipping only marks it. */
export async function finishOnboarding(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await authed();
  const name = String(formData.get("displayName") ?? "").trim().slice(0, 60);
  const hasAsset = String(formData.get("assetName") ?? "").trim() !== "";
  if (hasAsset) {
    const a = firstAsset.safeParse({ name: formData.get("assetName"), class: formData.get("assetClass"), value: String(formData.get("assetValue") ?? "") });
    if (!a.success) return failed("error.invalid");
    const { parseDecimal, todayIso } = await import("@/lib/format");
    const value = parseDecimal(a.data.value) ?? 0;
    if (value < 0) return failed("error.invalid");
    const { error } = await supabase.from("assets").insert({ user_id: userId, name: a.data.name, class: a.data.class, manual_value: value, manual_value_at: todayIso(), color: a.data.class === "liquidity" ? "green" : "blue" });
    if (error) return failed("error.save");
  }
  const { error } = await supabase.from("profiles").update({ onboarded: true, ...(name ? { display_name: name } : {}) }).eq("user_id", userId);
  if (error) return failed("error.save");
  refresh();
  return { ok: true };
}
