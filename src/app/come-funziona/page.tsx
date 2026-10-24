import Link from "next/link";
import { t } from "@/lib/i18n";

export const metadata = { title: "Come funziona · MyFinance" };

export default function HowItWorksPage() {
  return (
    <div className="wrap">
      <header className="top">
        <div><h1>{t("how.title")}</h1><p className="sub">{t("app.tagline")}</p></div>
        <div style={{ display: "flex", gap: 8 }}><Link className="btn" href="/demo">{t("how.demo")}</Link><Link className="btn primary" href="/login">{t("how.login")}</Link></div>
      </header>

      <section className="card">
        <h2>{t("how.s1.title")}</h2>
        <ul>
          <li>{t("how.s1.a")}</li>
          <li>{t("how.s1.b")}</li>
          <li>{t("how.s1.c")}</li>
          <li>{t("how.s1.d")}</li>
        </ul>
      </section>

      <section className="card">
        <h2>{t("how.s2.title")}</h2>
        <ul>
          <li>{t("how.s2.a")}</li>
          <li>{t("how.s2.b")}</li>
          <li>{t("how.s2.c")}</li>
          <li>{t("how.s2.d")}</li>
        </ul>
        <p className="note">{t("disclaimer")}</p>
      </section>
    </div>
  );
}
