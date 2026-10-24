import Link from "next/link";
import { OverviewView } from "@/components/overview";
import { demoData } from "@/lib/demo";
import { t } from "@/lib/i18n";

export const metadata = { title: "Demo · MyFinance" };

// Public, read-only, fictional data. Same dashboard component as the real app.
export default async function DemoPage({ searchParams }: { searchParams: Promise<{ alloc?: string; cat?: string }> }) {
  const { alloc = "asset", cat = "" } = await searchParams;
  return (
    <div className="wrap">
      <header className="top">
        <div><h1>{t("app.name")}</h1><p className="sub">{t("demo.badge")}</p></div>
        <Link className="btn primary" href="/login">{t("demo.cta")}</Link>
      </header>
      <div className="card" role="note" style={{ borderColor: "var(--warn)" }}>{t("demo.notice")}</div>
      <OverviewView data={demoData()} alloc={alloc} cat={cat} readOnly />
      <p className="foot">{t("disclaimer")}</p>
    </div>
  );
}
