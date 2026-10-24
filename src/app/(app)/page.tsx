import { ActionButton, ParamSelect } from "@/components/client-bits";
import { Donut, LineChart, type Slice } from "@/components/charts";
import { computePortfolio, expensesByCategory, monthlyStats } from "@/lib/calc";
import { loadData } from "@/lib/data";
import { formatMoney, formatPct, formatSigned, monthLong, monthShort, todayIso } from "@/lib/format";
import { t, type MessageKey } from "@/lib/i18n";
import { CLASS_COLOR, colorVar } from "@/lib/palette";
import { createClient } from "@/lib/supabase/server";
import type { AssetClass } from "@/lib/types";
import { saveSnapshot } from "../actions";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ alloc?: string; cat?: string }> }) {
  const { alloc = "asset", cat = "" } = await searchParams;
  const data = await loadData(await createClient());
  const p = computePortfolio(data.assets, data.transactions, data.prices);
  const months = monthlyStats(data.transactions);
  const curMonth = todayIso().slice(0, 7);
  const cur = months.find((m) => m.month === curMonth) ?? { income: 0, expense: 0 };

  // Allocation: by asset (rows sharing a group label merge) or by class. Receivables never count.
  const held = p.rows.filter((r) => r.class !== "receivable" && r.value > 0);
  let slices: Slice[];
  if (alloc === "class") {
    const byClass = new Map<AssetClass, number>();
    held.forEach((r) => byClass.set(r.class, (byClass.get(r.class) ?? 0) + r.value));
    slices = [...byClass].map(([c, value]) => ({ label: t(`class.${c}` as MessageKey), value, color: colorVar(CLASS_COLOR[c]) }));
  } else {
    const groups = new Map<string, Slice>();
    held.forEach((r) => {
      const label = r.groupLabel || r.name;
      const g = groups.get(label + r.color) ?? { label, value: 0, color: colorVar(r.color) };
      g.value += r.value;
      groups.set(label + r.color, g);
    });
    slices = [...groups.values()];
  }
  slices.sort((a, b) => b.value - a.value);
  const allocTotal = slices.reduce((a, s) => a + s.value, 0);

  const cats = expensesByCategory(data.transactions, cat || undefined);
  const catTotal = cats.reduce((a, c) => a + c.total, 0);
  const maxMonth = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
  const snaps = data.snapshots;

  return (
    <div className="view">
      <section className="card hero">
        <div>
          <h2>{t("overview.netWorth")}</h2>
          <div className="big">{formatMoney(p.netWorth)}</div>
          <div className="mut" style={{ fontSize: 13 }}>{t("overview.receivablesExcluded")} <span className="num">{formatMoney(p.receivables)}</span></div>
        </div>
        <div className="stats">
          <div className="stat"><small>{t("class.liquidity")}</small><b>{formatMoney(p.liquidity)}</b></div>
          <div className="stat"><small>{t("overview.invested")}</small><b>{formatMoney(p.invested)}</b>
            {p.etfGain !== null && p.etfGainPct !== null && <i className={p.etfGain >= 0 ? "pos" : "neg"}>{formatSigned(p.etfGain)} · {formatPct(p.etfGainPct)}</i>}</div>
          <div className="stat"><small>{t("class.crypto")}</small><b>{formatMoney(p.crypto)}</b></div>
          <div className="stat"><small>{t("overview.pacMonthly")}</small><b>{formatMoney(p.monthlyPac)}</b></div>
          <div className="stat"><small>{monthLong(curMonth)}</small><b className={cur.income - cur.expense >= 0 ? "pos" : "neg"}>{formatSigned(cur.income - cur.expense)}</b>
            <i className="mut">{t("overview.inOut", { income: formatMoney(cur.income), expense: formatMoney(cur.expense) })}</i></div>
        </div>
      </section>

      <div className="grid2">
        <section className="card">
          <div className="card-head">
            <h2>{t("overview.allocation")}</h2>
            <div className="seg">
              <a href="?alloc=asset" aria-current={alloc !== "class"}>{t("overview.byAsset")}</a>
              <a href="?alloc=class" aria-current={alloc === "class"}>{t("overview.byClass")}</a>
            </div>
          </div>
          {slices.length ? (
            <div className="alloc">
              <Donut items={slices} />
              <ul className="legend">
                {slices.map((s) => (
                  <li key={s.label}><span className="dot" style={{ background: s.color }} /><span className="nm">{s.label}</span>
                    <span className="num">{formatMoney(s.value)}</span><span className="num mut">{((s.value / allocTotal) * 100).toFixed(1).replace(".", ",")}%</span></li>
                ))}
              </ul>
            </div>
          ) : <div className="empty">{t("overview.emptyAllocation")}</div>}
        </section>

        <section className="card">
          <div className="card-head"><h2>{t("overview.history")}</h2><ActionButton action={saveSnapshot}>{t("overview.saveSnapshot")}</ActionButton></div>
          {snaps.length ? (
            <LineChart aria={t("overview.history")} labels={snaps.map((s) => new Date(s.date + "T00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" }))}
              series={[{ color: "var(--accent)", area: true, points: snaps.map((s) => s.netWorth) }]} />
          ) : <div className="empty">{t("overview.emptyHistory")}</div>}
          <p className="note">{t("overview.historyNote")}</p>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>{t("overview.monthly")}</h2>
          <div className="key"><span><i style={{ background: "var(--accent)" }} />{t("tx.type.income")}</span><span><i style={{ background: "var(--c-orange)" }} />{t("tx.type.expense")}</span><span>{t("overview.rateBelow")}</span></div>
        </div>
        {months.length ? (
          <div className="mchart"><div className="mrow">
            {months.map((m) => (
              <div className="mcol" key={m.month}>
                <div className="bars">
                  <i className="b-in" style={{ height: `${(m.income / maxMonth) * 100}%` }} title={`${t("tx.type.income")} ${formatMoney(m.income)}`} />
                  <i className="b-out" style={{ height: `${(m.expense / maxMonth) * 100}%` }} title={`${t("tx.type.expense")} ${formatMoney(m.expense)}`} />
                </div>
                <b>{monthShort(m.month)}</b>
                {m.savingsRate === null ? <small>{t("common.na")}</small>
                  : <span className={`chip ${m.savingsRate >= 20 ? "good" : m.savingsRate >= 0 ? "mid" : "bad"}`}>{Math.round(m.savingsRate)}%</span>}
                <small>{formatMoney(m.expense)}</small>
              </div>
            ))}
          </div></div>
        ) : <div className="empty">{t("overview.emptyMonthly")}</div>}
        <p className="note">{t("overview.rateNote")}</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{t("overview.byCategory")}</h2>
          <ParamSelect param="cat" value={cat} label={t("common.period")}
            options={[{ value: "", label: t("common.allPeriod") }, ...[...months].reverse().map((m) => ({ value: m.month, label: monthLong(m.month) }))]} />
        </div>
        {cats.length ? (
          <>
            {cats.map((c) => (
              <div className="catrow" key={c.category}>
                <span>{c.category}</span><span className="catbar"><i style={{ width: `${(c.total / cats[0].total) * 100}%` }} /></span>
                <span className="num">{formatMoney(c.total)} <span className="mut">{Math.round((c.total / catTotal) * 100)}%</span></span>
              </div>
            ))}
            <div className="catrow" style={{ borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 8 }}><b>{t("common.total")}</b><span /><b className="num">{formatMoney(catTotal)}</b></div>
          </>
        ) : <div className="empty">{t("overview.emptyCategory")}</div>}
      </section>
    </div>
  );
}
