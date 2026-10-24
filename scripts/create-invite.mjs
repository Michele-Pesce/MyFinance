// Usage: node --env-file=.env.local scripts/create-invite.mjs [max_uses] [days_valid]
// Creates one random invite code (uses the service-role key: run it on your own machine only).
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [maxUses = "1", days] = process.argv.slice(2);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const code = randomBytes(5).toString("hex").toUpperCase();
const expires_at = days ? new Date(Date.now() + Number(days) * 86_400_000).toISOString() : null;
const { error } = await admin.from("invite_codes").insert({ code, max_uses: Number(maxUses), expires_at });
if (error) { console.error("Failed:", error.message); process.exit(1); }
console.log(`Invite code: ${code}  (max uses: ${maxUses}${days ? `, valid ${days} days` : ""})`);
