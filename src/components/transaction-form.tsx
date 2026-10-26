"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveTransaction } from "@/app/actions";
import type { Category } from "@/lib/data";
import { toInput, todayIso } from "@/lib/format";
import { t, type MessageKey } from "@/lib/i18n";
import { TX_TYPES, type Asset, type Transaction, type TxType } from "@/lib/types";

const LAST_ACCOUNT = "lastAccount";
const lastAccount = () => { try { return localStorage.getItem(LAST_ACCOUNT) ?? ""; } catch { return ""; } };

export function TransactionForm({ categories, assets, accounts, editing }: {
  categories: Category[]; assets: Pick<Asset, "id" | "name">[]; accounts: Pick<Asset, "id" | "name">[]; editing?: Transaction;
}) {
  const [type, setType] = useState<TxType>(editing?.type ?? "expense");
  const [error, setError] = useState<MessageKey | null>(null);
  const [resetKey, setResetKey] = useState(0);
  // Account the money moves from/to (cash, card...). New entries start from the one used last time; the choice is still asked each time.
  const [account, setAccount] = useState(() => {
    const id = editing ? editing.assetId ?? "" : lastAccount();
    return accounts.some((a) => a.id === id) ? id : "";
  });
  const [pending, start] = useTransition();
  const investment = type === "pac" || type === "lump_sum";
  const cats = categories.filter((c) => c.kind === (type === "income" ? "income" : "expense"));

  const submit = (fd: FormData) => start(async () => {
    const r = await saveTransaction(fd);
    if (r.ok) {
      setError(null);
      setResetKey((k) => k + 1);
      if (!investment) try { localStorage.setItem(LAST_ACCOUNT, String(fd.get("assetId") ?? "")); } catch { /* not kept */ }
    } else setError(r.error as MessageKey);
  });

  return (
    // key resets the uncontrolled inputs after a successful save or when switching to edit another row
    <form className="card" action={submit} autoComplete="off" key={`${editing?.id ?? "new"}-${resetKey}`}>
      <div className="card-head"><h2>{t(editing ? "tx.edit" : "tx.new")}</h2></div>
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <div className="form">
        <label className="f">{t("tx.date")}<input type="date" name="date" required defaultValue={editing?.date ?? todayIso()} /></label>
        <label className="f">{t("tx.type")}
          <select name="type" value={type} onChange={(e) => setType(e.target.value as TxType)}>
            {TX_TYPES.map((x) => <option key={x} value={x}>{t(`tx.type.${x}` as MessageKey)}</option>)}
          </select></label>
        {!investment && (
          <label className="f">{t("tx.category")}
            <select name="category" defaultValue={editing?.category ?? ""}>
              <option value="">—</option>
              {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select></label>
        )}
        {!investment && (accounts.length ? (
          <label className="f">{t(type === "income" ? "tx.accountIn" : "tx.accountOut")}
            <select name="assetId" value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">{t("tx.accountNone")}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label>
        ) : <p className="note full">{t("tx.accountMissing")}</p>)}
        <label className="f">{t("tx.amount")}<input type="text" inputMode="decimal" name="amount" required placeholder="0,00" defaultValue={toInput(editing?.amount)} /></label>
        {investment && (
          <>
            <label className="f">{t("tx.asset")}
              <select name="assetId" defaultValue={editing?.assetId ?? ""} required>
                <option value="" disabled>—</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></label>
            <label className="f">{t("tx.units")}<input type="text" inputMode="decimal" name="units" placeholder="0,000" defaultValue={editing?.unitsEstimated ? "" : toInput(editing?.units)} /></label>
          </>
        )}
        <label className="f full">{t("tx.description")}<input type="text" name="description" placeholder={t("tx.descriptionHint")} defaultValue={editing?.description ?? ""} /></label>
      </div>
      {investment && <p className="note">{t("tx.unitsHint")}</p>}
      {error && <p className="neg" role="alert">{t(error)}</p>}
      <div className="actions">
        <button className="btn primary" disabled={pending}>{t(editing ? "common.saveChange" : "common.add")}</button>
        {editing && <Link className="btn" href="/transactions">{t("tx.cancelEdit")}</Link>}
      </div>
    </form>
  );
}
