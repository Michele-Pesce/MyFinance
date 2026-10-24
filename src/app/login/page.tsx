import Link from "next/link";
import { LoginForm } from "./login-form";
import { t } from "@/lib/i18n";

export default function LoginPage() {
  return (
    <main className="login view">
      <div>
        <h1>{t("app.name")}</h1>
        <p className="sub">{t("app.tagline")}</p>
      </div>
      <LoginForm />
      <p className="foot"><Link href="/demo">{t("how.demo")}</Link> · <Link href="/come-funziona">{t("nav.howItWorks")}</Link></p>
      <p className="foot">{t("disclaimer")}</p>
    </main>
  );
}
