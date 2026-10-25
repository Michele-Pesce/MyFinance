"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { MessageKey } from "@/lib/i18n";
import { allow, clientIp } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

// Login = email + 6-digit code. One account per email. The code is emailed, then typed in the same browser/PWA,
// so there is no link to open in a different context (the problem with magic links on iOS home-screen apps).
export type LoginState = { codeSent?: boolean; email?: string; error?: MessageKey };

const emailSchema = z.string().trim().toLowerCase().email();

/** Step 1: send the code. A new address needs a valid invite code (DB trigger on auth.users); existing users don't. */
export async function requestCode(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = emailSchema.safeParse(String(formData.get("email") ?? ""));
  if (!email.success) return { error: "error.email" };

  // Per IP (bulk probing) and per address (email bombing / invite-code guessing).
  const ip = await clientIp();
  if (!(await allow(["login-ip", ip], 10, 600)) || !(await allow(["login-email", email.data], 10, 600))) return { email: email.data, error: "error.rateLimit" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { data: { invite_code: String(formData.get("invite") ?? "") } },
  });
  if (error) {
    if (error.status === 429) return { email: email.data, error: "error.rateLimit" };
    // The invite trigger fails the signup with this generic message; any other failure (e.g. the email provider) is not the code's fault.
    // Known limit: a wrong invite code tells a new address from a known one; accepted for an invite-only app, rate limited above.
    return { email: email.data, error: /database error saving new user/i.test(error.message) ? "error.invite" : "error.emailSend" };
  }
  return { codeSent: true, email: email.data };
}

/** Step 2: check the code and open the session. Attempts are limited so a 6-digit code cannot be brute-forced. */
export async function verifyCode(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = emailSchema.safeParse(String(formData.get("email") ?? ""));
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!email.success || !/^\d{6}$/.test(token)) return { codeSent: true, email: email.data, error: "error.codeInvalid" };

  const ip = await clientIp();
  if (!(await allow(["verify-email", email.data], 5, 600)) || !(await allow(["verify-ip", ip], 20, 600))) return { codeSent: true, email: email.data, error: "error.rateLimit" };

  const supabase = await createClient();
  // First sign-in of a new address may be a "signup" token; try both before giving up.
  let { error } = await supabase.auth.verifyOtp({ email: email.data, token, type: "email" });
  if (error) ({ error } = await supabase.auth.verifyOtp({ email: email.data, token, type: "signup" }));
  if (error) return { codeSent: true, email: email.data, error: error.status === 429 ? "error.rateLimit" : "error.codeInvalid" };
  redirect("/");
}
