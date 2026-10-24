import { AssetSheet, CollectReceivable, Projection, QuickInput } from "@/components/portfolio-client";
import { CLASS_ORDER, computePortfolio } from "@/lib/calc";
import { loadData } from "@/lib/data";
import { formatDate, formatMoney, formatPct, formatSigned, todayIso } from "@/lib/format";
import { t, type MessageKey } from "@/lib/i18n";
import { colorVar } from "@/lib/palette";
import { isStale } from "@/lib/staleness";
import { createClient } from "@/lib/supabase/server";

export default async function PortfolioPage() {
  const data = await loadData(await createClient());
  const p = computePortfolio(data.assets, data.transactions, data.prices);
  const today = todayIso();
  const platforms = [...new Set(data.assets.map((a) => a.platform).filter((x): x is string => !!x))];
  const liquidity = p.rows.filter((r) => r.class === "liquidity").map((r) => ({ id: r.id, name: r.name }));
  const groups = CLASS_ORDER.map((c) => ({ c, rows: p.rows.filter((r) => r.class === c) })).filter((g) => g.rows.length);

  return (
    <div className="view">
      <section className="card">
        <div className="card-head">
          <h2>{t("portfolio.title")}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="btn" href="/api/export/transactions">{t("portfolio.exportCsv")}</a>
            <AssetSheet platforms={platforms} className="btn primary">{t("asset.new")}</AssetSheet>
          </div>
        </div>
        {groups.length ? groups.map((g) => (
          <div key={g.c}>
            <div className="grp-h">
              <h3>{t(`class.${g.c}` as MessageKey)}{g.c === "receivable" && <> <span className="mut" style={{ fontWeight: 400, fontSize: 12 }}>{t("portfolio.notInNetWorth")}</span></>}</h3>
              <span className="num">{formatMoney(g.rows.reduce((a, r) => a + r.value, 0))}</span>
            </div>
            {g.rows.map((r) => {
              const auto = r.instrumentId ? data.priceDates[r.instrumentId] : undefined;
              const sub = [r.platform, r.monthlyContribution > 0 ? t("portfolio.pacPerMonth", { amount: formatMoney(r.monthlyContribution) }) : ""].filter(Boolean).join(" · ");
              return (
                <div className="arow" key={r.id}>
                  <span className="dot" style={{ background: colorVar(r.color) }} />
                  <div className="nm"><b>{r.name}</b><small>{sub}</small>
                    {r.instrumentId && !auto && <small className="mut" style={{ display: "block" }}>{t("portfolio.waitingPrice")}</small>}
                    {auto && <small className={isStale(auto, today) ? "warn" : undefined} style={{ display: "block" }}>
                      {isStale(auto, today) ? "⚠ " : ""}{t("portfolio.priceUpdated", { date: formatDate(auto).slice(0, 5) })}</small>}
                  </div>
                  <div className="statsbox">
                    <div className="cell"><small>{t("portfolio.invested")}</small>{r.invested > 0 ? formatMoney(r.invested) : <span className="mut">–</span>}</div>
                    <div className="cell"><small>{t("portfolio.value")}</small><b>{formatMoney(r.value)}</b></div>
                    <div className="cell"><small>{t("portfolio.gain")}</small>
                      {r.gain === null || r.gainPct === null ? <span className="mut">{t("common.na")}</span>
                        : <><span className={r.gain >= 0 ? "pos" : "neg"}>{formatSigned(r.gain)}</span><i className={r.gain >= 0 ? "pos" : "neg"}>{formatPct(r.gainPct)}</i></>}</div>
                  </div>
                  <div className="quick">
                    {r.price !== null && !auto
                      ? <QuickInput id={r.id} field="price" value={r.price} />
                      : !auto && <QuickInput id={r.id} field="value" value={r.value} />}
                  </div>
                  <div className="acts">
                    <AssetSheet asset={data.assets.find((a) => a.id === r.id)} platforms={platforms} instrument={r.instrumentId ? data.instruments[r.instrumentId] : null}>{t("common.edit")}</AssetSheet>
                    {r.class === "receivable" && <CollectReceivable id={r.id} targets={liquidity} />}
                  </div>
                </div>
              );
            })}
          </div>
        )) : <div className="empty">{t("portfolio.empty")}</div>}
        <p className="note">{t("portfolio.note")}</p>
      </section>

      <Projection start={p.etfValue} monthly={p.monthlyPac} />
    </div>
  );
}
