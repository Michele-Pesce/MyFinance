"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { MessageKey } from "@/lib/i18n";
import { allow, clientIp } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { sent?: boolean; error?: MessageKey };

/** Magic link. A new address needs a valid invite code (checked by the DB trigger on auth.users); existing users don't. */
export async function requestLink(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.string().email().safeParse(String(formData.get("email") ?? "").trim());
  if (!email.success) return { error: "error.email" };

  // Per IP (bulk probing) and per address (email bombing / invite-code guessing).
  const ip = await clientIp();
  if (!(await allow(["login-ip", ip], 10, 600)) || !(await allow(["login-email", email.data.toLowerCase()], 3, 600))) return { error: "error.rateLimit" };

  // Prefer the configured public URL: the Host/Origin headers are client-controlled.
  const h = await headers();
  const origin = process.env.SITE_URL ?? h.get("origin") ?? `http://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${origin}/auth/callback`, data: { invite_code: String(formData.get("invite") ?? "") } },
  });
  // The trigger's rejection surfaces as a generic signup error. Known limit: a wrong invite code on an unknown address
  // is distinguishable from a known one; accepted for an invite-only app, and rate limited above.
  if (error) {
    if (error.status === 429) return { error: "error.rateLimit" };
    // The invite trigger fails the signup with this generic message; any other failure (e.g. the email provider) is not the code's fault.
    return { error: /database error saving new user/i.test(error.message) ? "error.invite" : "error.emailSend" };
  }
  return { sent: true };
}
