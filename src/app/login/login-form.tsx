"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type LoginState } from "./actions";
import { t } from "@/lib/i18n";

export function LoginForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState<LoginState, FormData>(signIn, {});
  const [upState, upAction, upPending] = useActionState<LoginState, FormData>(signUp, {});
  // Controlled fields: React clears an uncontrolled form after every action, which would wipe what the user typed on an error.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const up = mode === "up";
  const state = up ? upState : inState;

  return (
    <form className="card" action={up ? upAction : inAction}>
      <div className="seg" role="group" aria-label={t("login.modes")} style={{ marginBottom: 14 }}>
        <button type="button" aria-pressed={!up} onClick={() => setMode("in")}>{t("login.tabIn")}</button>
        <button type="button" aria-pressed={up} onClick={() => setMode("up")}>{t("login.tabUp")}</button>
      </div>
      <div className="form">
        <label className="f full">{t("login.email")}<input type="email" name="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="f full">{t("login.password")}
          <input type="password" name="password" required minLength={up ? 8 : undefined} maxLength={72} autoComplete={up ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {up && <label className="f full">{t("login.inviteCode")}<input type="text" name="invite" required autoComplete="off" value={invite} onChange={(e) => setInvite(e.target.value)} /></label>}
      </div>
      <p className="note">{t(up ? "login.upHint" : "login.inHint")}</p>
      {state.error && <p className="neg" role="alert">{t(state.error)}</p>}
      <div className="actions"><button className="btn primary" disabled={inPending || upPending}>{t(up ? "login.createAccount" : "login.enter")}</button></div>
    </form>
  );
}
