import Link from "next/link";
import { ActionButton, ParamSelect } from "@/components/client-bits";
import { TransactionForm } from "@/components/transaction-form";
import { monthlyStats } from "@/lib/calc";
import { loadData } from "@/lib/data";
import { formatDate, formatMoney, monthLong, todayIso } from "@/lib/format";
import { t, type MessageKey } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { TX_TYPES } from "@/lib/types";
import { deleteTransaction } from "../../actions";

const PAGE = 200;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ m?: string; type?: string; edit?: string }> }) {
  const sp = await searchParams;
  const data = await loadData(await createClient());
  const months = monthlyStats(data.transactions).map((m) => m.month).reverse();
  const cur = todayIso().slice(0, 7);
  // Default to the current month when it has movements, otherwise show everything ("all").
  const month = sp.m ?? (months.includes(cur) ? cur : "all");
  const type = sp.type ?? "";

  const list = data.transactions
    .filter((x) => (month === "all" || x.date.startsWith(month)) && (!type || x.type === type))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const sum = (ty: string) => list.filter((x) => x.type === ty).reduce((a, x) => a + x.amount, 0);
  const assetName = (id?: string | null) => data.assets.find((a) => a.id === id)?.name;
  const investable = data.assets.filter((a) => a.class !== "liquidity" && a.class !== "receivable" && !a.archived);
  const editing = data.transactions.find((x) => x.id === sp.edit);

  return (
    <div className="view">
      <TransactionForm categories={data.categories} assets={investable} editing={editing} />

      <section className="card">
        <div className="card-head">
          <h2>{t("tx.register")}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ParamSelect param="m" value={month} label={t("common.month")} options={[{ value: "all", label: t("common.allMonths") }, ...months.map((m) => ({ value: m, label: monthLong(m) }))]} />
            <ParamSelect param="type" value={type} label={t("tx.type")} options={[{ value: "", label: t("common.allTypes") }, ...TX_TYPES.map((x) => ({ value: x, label: t(`tx.type.${x}` as MessageKey) }))]} />
          </div>
        </div>
        {list.length ? (
          <>
            <div className="mut" style={{ fontSize: 13, marginBottom: 6 }}>
              {t("tx.summary", { n: list.length })} · {t("tx.type.income").toLowerCase()} <span className="num pos">{formatMoney(sum("income"))}</span> · {t("tx.type.expense").toLowerCase()} <span className="num neg">{formatMoney(sum("expense"))}</span>
            </div>
            {list.slice(0, PAGE).map((x) => {
              const inv = x.type === "pac" || x.type === "lump_sum";
              return (
                <div className="mv" key={x.id}>
                  <span className="d">{formatDate(x.date).slice(0, 5)}</span>
                  <span className="t"><b>{x.description || x.category || t(`tx.type.${x.type}` as MessageKey)}</b>
                    <small>{[t(`tx.type.${x.type}` as MessageKey), x.category, assetName(x.assetId), x.unitsEstimated ? t("tx.estimated") : ""].filter(Boolean).join(" · ")}</small></span>
                  <span className={`amt ${x.type === "income" ? "pos" : inv ? "mut" : ""}`}>{x.type === "income" ? "+" : inv ? "" : "−"}{formatMoney(x.amount)}</span>
                  <span className="acts">
                    <Link className="icon" href={`/transactions?edit=${x.id}`} scroll aria-label={t("common.edit")}>✎</Link>
                    <ActionButton className="icon" confirm action={deleteTransaction} args={[x.id]}>✕</ActionButton>
                  </span>
                </div>
              );
            })}
            {list.length > PAGE && <p className="note">{t("tx.truncated", { n: PAGE })}</p>}
          </>
        ) : <div className="empty">{t("tx.empty")}</div>}
      </section>
    </div>
  );
}
