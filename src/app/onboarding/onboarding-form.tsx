"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { finishOnboarding } from "@/app/account-actions";
import { t, type MessageKey } from "@/lib/i18n";
import { ASSET_CLASSES } from "@/lib/types";

export function OnboardingForm() {
  const router = useRouter();
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const run = (fd: FormData) => start(async () => {
    const r = await finishOnboarding(fd);
    if (r.ok) router.replace("/"); else setError(r.error as MessageKey);
  });
  return (
    <form className="card" action={run} autoComplete="off">
      <div className="form">
        <label className="f full">{t("onboarding.name")}<input type="text" name="displayName" maxLength={60} /></label>
        <label className="f full">{t("onboarding.currency")}
          <select name="currency" defaultValue="EUR"><option value="EUR">EUR · Euro</option></select></label>
      </div>
      <h2 style={{ marginTop: 18 }}>{t("onboarding.firstAsset")}</h2>
      <p className="note">{t("onboarding.firstAssetHint")}</p>
      <div className="form">
        <label className="f full">{t("asset.name")}<input type="text" name="assetName" maxLength={100} /></label>
        <label className="f">{t("asset.class")}
          <select name="assetClass" defaultValue="liquidity">{ASSET_CLASSES.map((c) => <option key={c} value={c}>{t(`class.${c}` as MessageKey)}</option>)}</select></label>
        <label className="f">{t("asset.value")}<input type="text" inputMode="decimal" name="assetValue" placeholder="0,00" /></label>
      </div>
      <p className="note">{t("onboarding.categoriesHint")}</p>
      {error && <p className="neg" role="alert">{t(error)}</p>}
      <div className="actions">
        <button className="btn primary" disabled={pending}>{t("onboarding.start")}</button>
        {/* Skip: same action with the asset fields cleared */}
        <button type="button" className="btn" disabled={pending} onClick={() => run(new FormData())}>{t("onboarding.skip")}</button>
      </div>
    </form>
  );
}
