"use client";

import { useState } from "react";
import { LineChart } from "@/components/charts";
import { computeFire, sensitivity } from "@/lib/calc";
import { formatMoney, monthLong, parseDecimal, toInput } from "@/lib/format";
import { t } from "@/lib/i18n";

export interface FireDefaults { invested: number; crypto: number; liquidity: number; expenses: number | null; monthly: number }

const RETURNS = [0.02, 0.03, 0.04, 0.05, 0.06];
const RATES = [0.03, 0.035, 0.04];

// Assumptions (rates, ages) are a UI preference kept in this browser only; the amounts always start from your data.
const readPref = (k: string, fb: string) => { try { return localStorage.getItem("fire." + k) ?? fb; } catch { return fb; } };
const savePref = (k: string, v: string) => { try { localStorage.setItem("fire." + k, v); } catch { /* not kept */ } };

function Field({ label, value, onChange, hint, suffix }: { label: string; value: string; onChange: (v: string) => void; hint?: string; suffix?: string }) {
  return (
    <label className="f">{label}{suffix ? ` (${suffix})` : ""}
      <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span style={{ fontSize: 11 }}>{hint}</span>}
    </label>
  );
}

export function FireCalculator({ d }: { d: FireDefaults }) {
  const [liquidity, setLiquidity] = useState(false);
  const [portfolio, setPortfolio] = useState<string | null>(null); // null = follow the data
  const [expenses, setExpenses] = useState(toInput(d.expenses ? Math.round(d.expenses) : 0));
  const [monthly, setMonthly] = useState(toInput(Math.round(d.monthly)));
  const [swr, setSwr] = useState(() => readPref("swr", "4"));
  const [ret, setRet] = useState(() => readPref("ret", "4"));
  const [age, setAge] = useState(() => readPref("age", ""));
  const [retire, setRetire] = useState(() => readPref("retire", ""));

  const dataPortfolio = d.invested + d.crypto + (liquidity ? d.liquidity : 0);
  const num = (s: string) => parseDecimal(s) ?? 0;
  const input = {
    portfolio: portfolio === null ? dataPortfolio : num(portfolio),
    monthlyContribution: num(monthly),
    annualExpenses: num(expenses),
    withdrawalRate: num(swr) / 100,
    realReturn: num(ret) / 100,
    currentAge: parseDecimal(age), retireAge: parseDecimal(retire),
  };
  const r = computeFire(input);
  const pct = Math.min(100, r.progress * 100);
  const years = r.monthsToFi === null ? null : Math.floor(r.monthsToFi / 12);
  const when = (() => {
    if (r.monthsToFi === null) return null;
    const now = new Date();
    const dt = new Date(now.getFullYear(), now.getMonth() + r.monthsToFi, 1);
    return monthLong(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
  })();
  const grid = r.valid ? sensitivity(input, RETURNS, RATES) : [];
  const set = (k: string, setter: (v: string) => void) => (v: string) => { setter(v); savePref(k, v); };

  return (
    <>
      <section className="card">
        <div className="card-head"><h2>{t("fire.assumptions")}</h2></div>
        <div className="form">
          <Field label={t("fire.portfolio")} value={portfolio ?? toInput(Math.round(dataPortfolio))} onChange={setPortfolio} hint={t("fire.portfolioHint")} suffix="€" />
          <Field label={t("fire.expenses")} value={expenses} onChange={setExpenses} hint={d.expenses ? t("fire.expensesHint") : t("fire.expensesNone")} suffix="€" />
          <Field label={t("fire.monthly")} value={monthly} onChange={setMonthly} hint={t("fire.monthlyHint")} suffix="€" />
          <Field label={t("fire.swr")} value={swr} onChange={set("swr", setSwr)} hint={t("fire.swrHint")} suffix="%" />
          <Field label={t("fire.return")} value={ret} onChange={set("ret", setRet)} hint={t("fire.returnHint")} suffix="%" />
          <Field label={t("fire.age")} value={age} onChange={set("age", setAge)} />
          <Field label={t("fire.retireAge")} value={retire} onChange={set("retire", setRetire)} />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: 14 }}>
          <input type="checkbox" checked={liquidity} onChange={(e) => { setLiquidity(e.target.checked); setPortfolio(null); }} />
          {t("fire.includeLiquidity", { amount: formatMoney(d.liquidity) })}
        </label>
      </section>

      {!r.valid ? (
        <div className="card"><div className="empty">{t("fire.invalid")}</div></div>
      ) : (
        <>
          <section className="card hero">
            <div>
              <h2>{t("fire.target")}</h2>
              <div className="big">{formatMoney(r.target)}</div>
              <div className="mut" style={{ fontSize: 13 }}>{t("fire.targetFormula", { expenses: formatMoney(input.annualExpenses), rate: swr })}</div>
            </div>
            <div className="stats">
              <div className="stat"><small>{t("fire.progress")}</small><b>{(r.progress * 100).toFixed(1).replace(".", ",")}%</b>
                <div className="catbar" style={{ marginTop: 6 }}><i style={{ width: `${pct}%`, background: "var(--accent)" }} /></div></div>
              <div className="stat"><small>{t("fire.timeToFi")}</small>
                <b>{r.reached ? t("fire.reached") : years === null ? t("fire.never") : t("fire.yearsMonths", { y: years, m: (r.monthsToFi as number) % 12 })}</b>
                {when && !r.reached && <i className="mut">{when}</i>}</div>
              <div className="stat"><small>{t("fire.missing")}</small><b>{formatMoney(Math.max(0, r.target - input.portfolio))}</b></div>
              <div className="stat"><small>{t("fire.income")}</small><b>{formatMoney(input.annualExpenses / 12)}</b><i className="mut">{t("fire.perMonth")}</i></div>
              {r.coastNumber !== null && (
                <div className="stat"><small>{t("fire.coast")}</small><b>{formatMoney(r.coastNumber)}</b>
                  <i className={r.coastReached ? "pos" : "mut"}>{r.coastReached ? t("fire.coastYes") : t("fire.coastNo")}</i></div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>{t("fire.chart")}</h2></div>
            <LineChart aria={t("fire.chart")} labels={r.series.map((p) => t("projection.yearLabel", { n: p.year }))}
              series={[{ color: "var(--accent)", area: true, points: r.series.map((p) => p.value) }, { color: "var(--c-orange)", dash: true, points: r.series.map(() => r.target) }]} />
            <div className="key" style={{ marginTop: 8 }}><span><i style={{ background: "var(--accent)" }} />{t("fire.portfolioLine")}</span><span><i style={{ background: "var(--c-orange)" }} />{t("fire.targetLine")}</span></div>
          </section>

          <section className="card">
            <div className="card-head"><h2>{t("fire.sensitivity")}</h2></div>
            <div className="scroll-x"><table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead><tr><th style={{ textAlign: "left" }} className="mut">{t("fire.returnShort")} \ {t("fire.swrShort")}</th>
                {RATES.map((w) => <th key={w} className="num">{(w * 100).toString().replace(".", ",")}%</th>)}</tr></thead>
              <tbody>{RETURNS.map((rr, i) => (
                <tr key={rr} style={{ borderTop: "1px solid var(--line)" }}>
                  <th style={{ textAlign: "left", fontWeight: 500 }} className="num">{(rr * 100).toFixed(0)}%</th>
                  {grid[i].map((yrs, j) => <td key={j} className="num" style={{ textAlign: "center" }}>{yrs === null ? "—" : t("fire.yearsShort", { n: yrs.toFixed(1).replace(".", ",") })}</td>)}
                </tr>))}</tbody></table></div>
            <p className="note">{t("fire.sensitivityNote")}</p>
          </section>
        </>
      )}
      <p className="note">{t("fire.disclaimer")}</p>
    </>
  );
}
