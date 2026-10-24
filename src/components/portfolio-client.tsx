"use client";

import { useState, useTransition } from "react";
import { collectReceivableAction, deleteAsset, quickUpdate, saveAsset, type ActionResult } from "@/app/actions";
import { linkInstrument, searchInstruments, unlinkInstrument, type SignedCandidate } from "@/app/instruments";
import { ActionButton } from "@/components/client-bits";
import { LineChart } from "@/components/charts";
import { projectPac } from "@/lib/calc";
import { formatMoney, formatSigned, toInput } from "@/lib/format";
import { t, type MessageKey } from "@/lib/i18n";
import { colorVar, PALETTE_KEYS } from "@/lib/palette";
import { ASSET_CLASSES, type Asset } from "@/lib/types";

/** Input that saves on blur/Enter: the "copy the value from the broker app" shortcut. */
export function QuickInput({ id, field, value }: { id: string; field: "price" | "value"; value: number }) {
  const [text, setText] = useState(toInput(Math.round(value * 100) / 100));
  const [err, setErr] = useState(false);
  const [, start] = useTransition();
  const commit = () => start(async () => {
    if (text === toInput(Math.round(value * 100) / 100)) return;
    const r = await quickUpdate(id, field, text);
    setErr(!r.ok);
  });
  return (
    <label className="f" style={{ fontSize: 11 }}>
      {t(field === "price" ? "portfolio.quickPrice" : "portfolio.quickValue")}
      <input type="text" inputMode="decimal" value={text} aria-invalid={err} onChange={(e) => setText(e.target.value)}
        onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
    </label>
  );
}

/** New / edit asset in a modal sheet. */
export function AssetSheet({ asset, platforms, instrument, children, className = "icon" }: {
  asset?: Asset; platforms: string[]; instrument?: { name: string; symbol: string | null } | null; children: React.ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const a = asset;
  const submit = (fd: FormData) => start(async () => {
    const r = await saveAsset(fd);
    if (r.ok) { setOpen(false); setError(null); } else setError(r.error as MessageKey);
  });
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{children}</button>
      {open && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label={t(a ? "asset.edit" : "asset.new")}
          onClick={(e) => e.target === e.currentTarget && setOpen(false)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <form className="card" action={submit} autoComplete="off">
            <div className="card-head"><h2>{t(a ? "asset.edit" : "asset.new")}</h2><button type="button" className="icon" onClick={() => setOpen(false)} aria-label={t("common.close")}>✕</button></div>
            {a && <input type="hidden" name="id" value={a.id} />}
            <div className="form">
              <label className="f full">{t("asset.name")}<input type="text" name="name" required autoFocus defaultValue={a?.name} /></label>
              <label className="f">{t("asset.class")}
                <select name="class" defaultValue={a?.class ?? "etf"}>{ASSET_CLASSES.map((c) => <option key={c} value={c}>{t(`class.${c}` as MessageKey)}</option>)}</select></label>
              <label className="f">{t("asset.platform")}<input type="text" name="platform" list="platforms" defaultValue={a?.platform ?? ""} />
                <datalist id="platforms">{platforms.map((p) => <option key={p} value={p} />)}</datalist></label>
              <label className="f">{t("asset.monthly")}<input type="text" inputMode="decimal" name="monthlyContribution" defaultValue={toInput(a?.monthlyContribution)} /></label>
              <label className="f">{t("asset.initialInvested")}<input type="text" inputMode="decimal" name="initialInvested" defaultValue={toInput(a?.initialInvested)} /></label>
              <label className="f">{t("asset.initialUnits")}<input type="text" inputMode="decimal" name="initialUnits" defaultValue={toInput(a?.initialUnits)} /></label>
              <label className="f">{t("asset.price")}<input type="text" inputMode="decimal" name="manualPrice" defaultValue={toInput(a?.manualPrice)} /></label>
              <label className="f">{t("asset.value")}<input type="text" inputMode="decimal" name="manualValue" defaultValue={toInput(a?.manualValue)} /></label>
              <label className="f">{t("asset.group")}<input type="text" name="groupLabel" defaultValue={a?.groupLabel ?? ""} /></label>
              <fieldset className="full" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="mut" style={{ fontSize: 12, marginBottom: 6, padding: 0 }}>{t("asset.color")}</legend>
                <div className="swatches">
                  {PALETTE_KEYS.map((k) => (
                    <label key={k} title={k}><input type="radio" name="color" value={k} defaultChecked={(a?.color ?? "default") === k} /><span style={{ background: colorVar(k) }} /></label>
                  ))}
                </div>
              </fieldset>
            </div>
            <p className="note">{t("asset.hint")}</p>
            {a ? <InstrumentLinker asset={a} instrument={instrument ?? null} /> : <p className="note">{t("asset.saveFirst")}</p>}
            {error && <p className="neg" role="alert">{t(error)}</p>}
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn primary" disabled={pending}>{t("common.save")}</button>
                <button type="button" className="btn" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
              </div>
              {a && <ActionButton className="btn danger" confirm action={async () => { const r = await deleteAsset(a.id); if (r.ok) setOpen(false); return r; }}>{t("asset.delete")}</ActionButton>}
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/** "Incassato": the user explicitly picks the liquidity asset that receives the money. */
export function CollectReceivable({ id, targets }: { id: string; targets: { id: string; name: string }[] }) {
  const [target, setTarget] = useState(targets[0]?.id ?? "");
  if (!targets.length) return <span className="mut" style={{ fontSize: 11 }}>{t("portfolio.needLiquidity")}</span>;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
      <select aria-label={t("portfolio.collectInto")} value={target} onChange={(e) => setTarget(e.target.value)} style={{ padding: "3px 6px", fontSize: 12 }}>
        {targets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <ActionButton className="icon" action={(): Promise<ActionResult> => collectReceivableAction(id, target)}>{t("portfolio.collected")}</ActionButton>
    </span>
  );
}

/** PAC projection: constant-return hypothesis. Sliders are a UI preference, kept in localStorage. */
export function Projection({ start, monthly }: { start: number; monthly: number }) {
  const [rate, setRate] = useState(() => readPref("rate", 5));
  const [years, setYears] = useState(() => readPref("years", 20));
  const pts = projectPac(start, monthly, rate / 100, years);
  const last = pts[pts.length - 1];
  return (
    <section className="card">
      <div className="card-head"><h2>{t("projection.title")}</h2><span className="mut" style={{ fontSize: 13 }}>{t("projection.start", { start: formatMoney(start), monthly: formatMoney(monthly) })}</span></div>
      <div className="range">
        <label>{t("projection.rate")} <b>{rate.toFixed(1).replace(".", ",")}%</b>
          <input type="range" min={0} max={12} step={0.5} value={rate} onChange={(e) => { setRate(+e.target.value); savePref("rate", +e.target.value); }} /></label>
        <label>{t("projection.horizon")} <b>{t("projection.years", { n: years })}</b>
          <input type="range" min={1} max={40} step={1} value={years} onChange={(e) => { setYears(+e.target.value); savePref("years", +e.target.value); }} /></label>
      </div>
      <div className="stats" style={{ marginBottom: 14 }}>
        <div className="stat"><small>{t("projection.contributed")}</small><b>{formatMoney(last.contributed)}</b></div>
        <div className="stat"><small>{t("projection.estimated")}</small><b>{formatMoney(last.value)}</b></div>
        <div className="stat"><small>{t("projection.gain")}</small><b className="pos">{formatSigned(last.value - last.contributed)}</b></div>
      </div>
      <LineChart aria={t("projection.title")} labels={pts.map((p) => t("projection.yearLabel", { n: p.year }))}
        series={[{ color: "var(--accent)", area: true, points: pts.map((p) => p.value) }, { color: "var(--muted)", dash: true, points: pts.map((p) => p.contributed) }]} />
      <div className="key" style={{ marginTop: 8 }}><span><i style={{ background: "var(--accent)" }} />{t("projection.estimated")}</span><span><i style={{ background: "var(--muted)" }} />{t("projection.contributed")}</span></div>
      <p className="note">{t("projection.note")}</p>
    </section>
  );
}

function readPref(key: string, fallback: number): number {
  try { const v = Number(localStorage.getItem("proj." + key)); return Number.isFinite(v) && v > 0 ? v : fallback; } catch { return fallback; }
}
function savePref(key: string, v: number) {
  try { localStorage.setItem("proj." + key, String(v)); } catch { /* storage unavailable: preference is not kept */ }
}

/** Link the asset to a tracked market price (ETF/stock via EODHD, crypto via CoinGecko). Outside the asset <form>'s submit path. */
function InstrumentLinker({ asset, instrument }: { asset: Asset; instrument: { name: string; symbol: string | null } | null }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SignedCandidate[] | null>(null);
  const [msg, setMsg] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const mode = asset.class === "crypto" ? "crypto" : "market";
  const searchable = asset.class !== "liquidity" && asset.class !== "receivable" && asset.class !== "other";
  if (!searchable) return null;

  const run = (fn: () => Promise<ActionResult | null>) => start(async () => {
    const r = await fn();
    setMsg(r && !r.ok ? (r.error as MessageKey) : null);
  });
  const search = () => run(async () => {
    const r = await searchInstruments(q, mode);
    if (!r.ok) { setResults(null); return r; }
    setResults(r.results);
    return null;
  });

  return (
    <fieldset className="full" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, margin: "12px 0 0" }}>
      <legend className="mut" style={{ fontSize: 12, padding: "0 6px" }}>{t("asset.autoPrice")}</legend>
      {instrument ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <span>{t("asset.linkedTo", { name: instrument.name })}</span>
          <button type="button" className="btn" disabled={pending} onClick={() => run(() => unlinkInstrument(asset.id))}>{t("asset.unlink")}</button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Enter must search, not submit the asset form */}
            <input type="text" value={q} placeholder={t(mode === "crypto" ? "asset.searchCrypto" : "asset.searchMarket")} aria-label={t("asset.search")}
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} />
            <button type="button" className="btn" disabled={pending || q.trim().length < 2} onClick={search}>{t("asset.search")}</button>
          </div>
          {results && !results.length && <p className="note">{t("asset.noResults")}</p>}
          {results?.map((r) => (
            <div key={r.c.provider + r.c.providerId} style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--line)", fontSize: 13 }}>
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}><b>{r.c.name}</b><br /><span className="mut">{[r.c.symbol, r.c.exchange, r.c.isin, r.c.currency].filter(Boolean).join(" · ")}</span></span>
              <button type="button" className="btn" disabled={pending} onClick={() => run(() => linkInstrument(asset.id, r))}>{t("asset.link")}</button>
            </div>
          ))}
        </>
      )}
      <p className="note">{t("asset.autoPriceHint")}</p>
      {msg && <p className="neg" role="alert">{t(msg)}</p>}
    </fieldset>
  );
}
