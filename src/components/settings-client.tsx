"use client";

import { useState, useTransition } from "react";
import { addCategory, deleteAccount, deleteCategory, importAssets, importTransactions, renameCategory, restoreBackup, type CountResult } from "@/app/account-actions";
import type { ActionResult } from "@/app/actions";
import { ActionButton } from "@/components/client-bits";
import type { Category } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import { buildRows, detectKind, guessMapping, isExactTxHeader, parseAssetsCsv, parseCsv, type Mapping } from "@/lib/import";
import { t, type MessageKey } from "@/lib/i18n";

const useMsg = () => {
  const [msg, setMsg] = useState<{ key: MessageKey; vars?: Record<string, string | number>; ok?: boolean } | null>(null);
  const show = (r: ActionResult | CountResult, okKey?: MessageKey) =>
    setMsg(r.ok ? (okKey ? { key: okKey, vars: { n: "count" in r ? r.count : 0 }, ok: true } : null) : { key: r.error as MessageKey });
  const node = msg && <p className={msg.ok ? "pos" : "neg"} role={msg.ok ? "status" : "alert"}>{t(msg.key, msg.vars)}</p>;
  return { show, node, set: setMsg };
};

/* ---------------------------- categories ---------------------------- */

function CategoryRow({ c }: { c: Category }) {
  const [name, setName] = useState(c.name);
  const [pending, start] = useTransition();
  const m = useMsg();
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 0" }}>
      <input type="text" value={name} aria-label={t("settings.catName")} onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== c.name && start(async () => m.show(await renameCategory(c.id, name)))} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} disabled={pending} />
      <ActionButton className="icon" confirm action={deleteCategory} args={[c.id]}>✕</ActionButton>
      {m.node}
    </div>
  );
}

function AddCategory({ kind }: { kind: "expense" | "income" }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const m = useMsg();
  const add = () => start(async () => { const r = await addCategory(kind, name); m.show(r); if (r.ok) setName(""); });
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
      <input type="text" value={name} placeholder={t("settings.catNew")} aria-label={t("settings.catNew")} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
      <button type="button" className="btn" disabled={pending || !name.trim()} onClick={add}>{t("common.add")}</button>
      {m.node}
    </div>
  );
}

export function CategoriesEditor({ categories }: { categories: Category[] }) {
  return (
    <div className="grid2">
      {(["expense", "income"] as const).map((kind) => (
        <div key={kind}>
          <h3>{t(`tx.type.${kind}` as MessageKey)}</h3>
          {categories.filter((c) => c.kind === kind).map((c) => <CategoryRow key={c.id + c.name} c={c} />)}
          <AddCategory kind={kind} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ CSV import ------------------------------ */

const FIELDS: { key: keyof Mapping; label: MessageKey; required?: boolean }[] = [
  { key: "date", label: "tx.date", required: true }, { key: "amount", label: "tx.amount", required: true }, { key: "type", label: "tx.type" },
  { key: "category", label: "tx.category" }, { key: "description", label: "tx.description" }, { key: "asset", label: "tx.asset" }, { key: "units", label: "tx.units" },
];

export function CsvImport() {
  const [table, setTable] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Mapping | null>(null);
  const [pending, start] = useTransition();
  const m = useMsg();

  const onFile = async (f?: File) => {
    if (!f) return;
    if (f.size > 5_000_000) return m.set({ key: "error.invalid" });
    const rows = parseCsv(await f.text());
    if (rows.length < 2) return m.set({ key: "error.invalid" });
    setTable(rows); setMap(guessMapping(rows[0])); m.set(null);
  };
  const kind = table ? detectKind(table[0]) : null;
  const built = kind === "transactions" && table && map && map.date >= 0 && map.amount >= 0 ? buildRows(table.slice(1), map) : null;
  const builtAssets = kind === "assets" && table ? parseAssetsCsv(table) : null;

  return (
    <div>
      <label className="f">{t("settings.csvFile")}<input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} /></label>
      {builtAssets && (
        <>
          <p className="note"><b>{t("settings.csvAssetsFound", { ok: builtAssets.valid.length, bad: builtAssets.errors.length })}</b>
            {builtAssets.errors.length > 0 && <> · {t("settings.csvErrors", { lines: builtAssets.errors.slice(0, 8).map((e) => `${e.line} (${t(`settings.csvErr.${e.reason}` as MessageKey)})`).join(", ") })}</>}</p>
          <div className="scroll-x"><table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <tbody>{builtAssets.valid.slice(0, 8).map((r, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                <td>{r.name}</td><td>{t(`class.${r.class}` as MessageKey)}</td><td className="num" style={{ textAlign: "right" }}>{formatMoney(r.manualValue)}</td>
              </tr>))}</tbody></table></div>
          <div className="actions">
            <button type="button" className="btn primary" disabled={pending || !builtAssets.valid.length}
              onClick={() => start(async () => { const r = await importAssets(builtAssets.valid); m.show(r, "settings.imported"); if (r.ok) { setTable(null); setMap(null); } })}>
              {t("settings.importAssetsDo", { n: builtAssets.valid.length })}</button>
          </div>
        </>
      )}
      {kind === "transactions" && table && map && (
        <>
          <p className="note">{isExactTxHeader(table[0]) ? t("settings.csvExact") : t("settings.csvMap")}</p>
          <div className="form">
            {FIELDS.map((f) => (
              <label className="f" key={f.key}>{t(f.label)}{f.required ? " *" : ""}
                <select value={map[f.key]} onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })}>
                  {!f.required && <option value={-1}>—</option>}
                  {f.required && map[f.key] < 0 && <option value={-1} disabled>—</option>}
                  {table[0].map((h, i) => <option key={i} value={i}>{h || `#${i + 1}`}</option>)}
                </select></label>
            ))}
          </div>
          {map.type < 0 && <p className="note">{t("settings.csvSign")}</p>}
          {built && (
            <>
              <p className="note"><b>{t("settings.csvSummary", { ok: built.valid.length, bad: built.errors.length })}</b>
                {built.errors.length > 0 && <> · {t("settings.csvErrors", { lines: built.errors.slice(0, 8).map((e) => `${e.line} (${t(`settings.csvErr.${e.reason}` as MessageKey)})`).join(", ") })}</>}</p>
              <div className="scroll-x"><table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <tbody>{built.valid.slice(0, 8).map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="num">{formatDate(r.date)}</td><td>{t(`tx.type.${r.type}` as MessageKey)}</td><td>{r.description || r.category || ""}</td><td className="num" style={{ textAlign: "right" }}>{formatMoney(r.amount)}</td>
                  </tr>))}</tbody></table></div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={pending || !built.valid.length}
                  onClick={() => start(async () => { const r = await importTransactions(built.valid); m.show(r, "settings.imported"); if (r.ok) { setTable(null); setMap(null); } })}>
                  {t("settings.importDo", { n: built.valid.length })}</button>
              </div>
            </>
          )}
        </>
      )}
      {m.node}
    </div>
  );
}

/* ------------------------------ restore ------------------------------ */

export function RestoreBackup() {
  const [pending, start] = useTransition();
  const m = useMsg();
  return (
    <div>
      <label className="f">{t("settings.restoreFile")}<input type="file" accept="application/json,.json" disabled={pending}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) start(async () => m.show(await restoreBackup(await f.text()), "settings.imported")); }} /></label>
      <p className="note">{t("settings.restoreNote")}</p>
      {m.node}
    </div>
  );
}

/* --------------------------- delete account --------------------------- */

export function DeleteAccount() {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const m = useMsg();
  return (
    <div>
      <p className="note" style={{ marginTop: 0 }}>{t("settings.deleteNote")}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="text" value={text} placeholder={t("settings.deletePlaceholder")} aria-label={t("settings.deletePlaceholder")} onChange={(e) => setText(e.target.value)} style={{ maxWidth: 220 }} />
        <button type="button" className="btn danger" disabled={pending || text.trim().toUpperCase() !== "ELIMINA"} onClick={() => start(async () => m.show(await deleteAccount(text)))}>{t("settings.deleteDo")}</button>
      </div>
      {m.node}
    </div>
  );
}
