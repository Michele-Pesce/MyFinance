"use client";

import { useActionState } from "react";
import { requestLink, type LoginState } from "./actions";
import { t } from "@/lib/i18n";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestLink, {});
  if (state.sent) {
    return (
      <div className="card" role="status">
        <h2>{t("login.sentTitle")}</h2>
        <p className="note">{t("login.sentBody")}</p>
      </div>
    );
  }
  return (
    <form className="card" action={action}>
      <div className="form">
        <label className="f full">{t("login.email")}<input type="email" name="email" required autoComplete="email" /></label>
        <label className="f full">{t("login.inviteCode")}<input type="text" name="invite" autoComplete="off" /></label>
      </div>
      <p className="note">{t("login.inviteHint")}</p>
      {state.error && <p className="neg" role="alert">{t(state.error)}</p>}
      <div className="actions"><button className="btn primary" disabled={pending}>{t("login.send")}</button></div>
    </form>
  );
}
