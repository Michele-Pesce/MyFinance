// Needs the local Supabase stack: `pnpm exec supabase start`, then `pnpm test:db`.
// Proves that user B can neither read nor change user A's data, and that anon sees nothing.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const run = ANON && SERVICE ? describe : describe.skip;

run("row level security", () => {
  let admin: SupabaseClient;
  let a: SupabaseClient, b: SupabaseClient, anon: SupabaseClient;
  let assetOfA: string;

  const signUp = async (email: string) => {
    const c = createClient(URL, ANON, { auth: { persistSession: false } });
    const password = crypto.randomUUID();
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    const { error: e2 } = await c.auth.signInWithPassword({ email, password });
    if (e2) throw e2;
    return c;
  };

  beforeAll(async () => {
    admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
    await admin.from("app_config").update({ value: "open" }).eq("key", "signup_mode");
    const tag = Date.now();
    a = await signUp(`a-${tag}@test.local`);
    b = await signUp(`b-${tag}@test.local`);
    anon = createClient(URL, ANON, { auth: { persistSession: false } });

    const uidA = (await a.auth.getUser()).data.user!.id;
    const { data, error } = await a.from("assets").insert({ user_id: uidA, name: "A cash", class: "liquidity", manual_value: 100 }).select().single();
    if (error) throw error;
    assetOfA = data.id;
  });

  it("new user gets a profile and default categories", async () => {
    const { data } = await b.from("categories").select("id");
    expect(data!.length).toBeGreaterThan(5);
  });

  it("B cannot read A's assets", async () => {
    const { data } = await b.from("assets").select("*");
    expect(data).toEqual([]);
  });

  it("B cannot update or delete A's asset", async () => {
    await b.from("assets").update({ name: "hacked" }).eq("id", assetOfA);
    await b.from("assets").delete().eq("id", assetOfA);
    const { data } = await a.from("assets").select("name").eq("id", assetOfA).single();
    expect(data?.name).toBe("A cash");
  });

  it("B cannot insert a row owned by A", async () => {
    const uidA = (await a.auth.getUser()).data.user!.id;
    const { error } = await b.from("assets").insert({ user_id: uidA, name: "x", class: "other" });
    expect(error).not.toBeNull();
  });

  it("B cannot attach a transaction to A's asset", async () => {
    const uidB = (await b.auth.getUser()).data.user!.id;
    const { error } = await b.from("transactions").insert({ user_id: uidB, date: "2026-01-01", type: "pac", amount: 10, asset_id: assetOfA });
    expect(error).not.toBeNull();
  });

  it("users cannot write shared market data", async () => {
    const { error } = await a.from("instruments").insert({ kind: "etf", provider: "x", provider_id: "x", name: "x" });
    expect(error).not.toBeNull();
  });

  it("users cannot read the provider budget table or bump it", async () => {
    const { data } = await a.from("provider_calls").select("*");
    expect(data ?? []).toEqual([]);
    const { error } = await a.rpc("bump_provider_calls", { p_provider: "x", p_date: "2026-01-01", p_n: 1 });
    expect(error).not.toBeNull();
  });

  it("anon sees nothing", async () => {
    const { data, error } = await anon.from("assets").select("*");
    expect(error !== null || data!.length === 0).toBe(true);
  });

  it("invite mode rejects signups without a valid code", async () => {
    await admin.from("app_config").update({ value: "invite" }).eq("key", "signup_mode");
    const { error } = await admin.auth.admin.createUser({ email: `c-${Date.now()}@test.local`, password: crypto.randomUUID(), email_confirm: true });
    expect(error).not.toBeNull();
    await admin.from("app_config").update({ value: "open" }).eq("key", "signup_mode");
  });
});
