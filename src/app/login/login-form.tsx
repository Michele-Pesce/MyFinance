"use client";

import { useActionState, useEffect, useState } from "react";
import { requestCode, verifyCode, type LoginState } from "./actions";
import { t } from "@/lib/i18n";

const RESEND_SECONDS = 60; // matches the email provider's minimum gap between two emails to the same address

export function LoginForm() {
  const [asked, ask, asking] = useActionState<LoginState, FormData>(requestCode, {});
  const [checked, check, checking] = useActionState<LoginState, FormData>(verifyCode, {});
  const [again, setAgain] = useState(false); // user went back to change email / ask a new code
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(0);

  const codeStep = asked.codeSent && !again;
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const wait = Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000));

  if (codeStep) {
    return (
      <form className="card" action={check} autoComplete="one-time-code">
        <input type="hidden" name="email" value={asked.email} />
        <p className="note" style={{ marginTop: 0 }} role="status">{t("login.codeSent", { email: asked.email ?? "" })}</p>
        <label className="f">{t("login.code")}
          <input type="text" name="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code" autoFocus required
            style={{ fontFamily: "var(--font-num)", fontSize: 24, letterSpacing: 8, textAlign: "center" }} /></label>
        {checked.error && <p className="neg" role="alert">{t(checked.error)}</p>}
        <div className="actions">
          <button className="btn primary" disabled={checking}>{t("login.enter")}</button>
          <button type="button" className="btn" onClick={() => setAgain(true)}>{t("login.changeEmail")}</button>
        </div>
        <p className="note">{wait > 0 ? t("login.resendIn", { s: wait }) : t("login.resendHint")}</p>
      </form>
    );
  }

  return (
    <form className="card" action={(fd) => { setAgain(false); setSentAt(Date.now()); setNow(Date.now()); ask(fd); }}>
      <div className="form">
        <label className="f full">{t("login.email")}<input type="email" name="email" required autoComplete="email" defaultValue={asked.email} /></label>
        <label className="f full">{t("login.inviteCode")}<input type="text" name="invite" autoComplete="off" /></label>
      </div>
      <p className="note">{t("login.inviteHint")}</p>
      {asked.error && <p className="neg" role="alert">{t(asked.error)}</p>}
      <div className="actions"><button className="btn primary" disabled={asking}>{t("login.send")}</button></div>
    </form>
  );
}
