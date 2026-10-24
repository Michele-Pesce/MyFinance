import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { signOut } from "./sign-out";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const today = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>{t("app.name")}</h1>
          <p className="sub">{today}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Nav />
          <form action={signOut}><button className="btn">{t("nav.signOut")}</button></form>
        </div>
      </header>
      {children}
      <p className="foot">{t("disclaimer")}</p>
      <p className="foot">{t("footer.sourcesPre")} <a href="https://www.coingecko.com" rel="noopener noreferrer">CoinGecko</a>{t("footer.sourcesPost")}</p>
    </div>
  );
}
