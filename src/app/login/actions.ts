"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { MessageKey } from "@/lib/i18n";
import { allow, clientIp } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

// Login = email + password chosen by the user. One account per email. Signing up needs an invite code (checked by a DB
// trigger on auth.users). No email is sent: no link to open in another context (iOS PWA) and no email-provider limits.
export type LoginState = { error?: MessageKey };

const email = z.string().trim().toLowerCase().email();
// bcrypt only reads the first 72 bytes: longer passwords would be silently truncated.
const password = z.string().min(8).max(72);

/** Create the account and sign in. */
export async function signUp(_: LoginState, formData: FormData): Promise<LoginState> {
  const e = email.safeParse(String(formData.get("email") ?? ""));
  if (!e.success) return { error: "error.email" };
  const p = password.safeParse(String(formData.get("password") ?? ""));
  if (!p.success) return { error: "error.weakPassword" };

  const ip = await clientIp();
  if (!(await allow(["signup-ip", ip], 10, 600)) || !(await allow(["signup-email", e.data], 5, 600))) return { error: "error.rateLimit" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email: e.data, password: p.data, options: { data: { invite_code: String(formData.get("invite") ?? "") } } });
  if (error) {
    if (error.status === 429) return { error: "error.rateLimit" };
    if (/already registered|already exists/i.test(error.message) || error.code === "user_already_exists") return { error: "error.accountExists" };
    if (error.code === "weak_password") return { error: "error.weakPassword" };
    // The invite trigger fails the signup with this generic message.
    return { error: /database error saving new user/i.test(error.message) ? "error.invite" : "error.signup" };
  }
  // No session means the project still requires email confirmation: not how this app is configured.
  if (!data.session) return { error: "error.signup" };
  redirect("/");
}

/** Sign in. Same message for a wrong password and an unknown email. Attempts limited per email and per IP. */
export async function signIn(_: LoginState, formData: FormData): Promise<LoginState> {
  const e = email.safeParse(String(formData.get("email") ?? ""));
  const pw = String(formData.get("password") ?? "");
  if (!e.success || !pw) return { error: "error.credentials" };

  const ip = await clientIp();
  if (!(await allow(["signin-email", e.data], 8, 600)) || !(await allow(["signin-ip", ip], 30, 600))) return { error: "error.rateLimit" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: e.data, password: pw });
  if (error) return { error: error.status === 429 ? "error.rateLimit" : "error.credentials" };
  redirect("/");
}
