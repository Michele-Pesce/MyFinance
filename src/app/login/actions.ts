"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { MessageKey } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { sent?: boolean; error?: MessageKey };

/** Magic link. A new address needs a valid invite code (checked by the DB trigger on auth.users); existing users don't. */
export async function requestLink(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.string().email().safeParse(String(formData.get("email") ?? "").trim());
  if (!email.success) return { error: "error.email" };

  const h = await headers();
  const origin = h.get("origin") ?? `http://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${origin}/auth/callback`, data: { invite_code: String(formData.get("invite") ?? "") } },
  });
  // The trigger's rejection surfaces as a generic signup error; either way don't reveal which emails exist.
  if (error) return { error: error.status === 429 ? "error.rateLimit" : "error.invite" };
  return { sent: true };
}
