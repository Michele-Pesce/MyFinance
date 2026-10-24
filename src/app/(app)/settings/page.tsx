import { CategoriesEditor, CsvImport, DeleteAccount, RestoreBackup } from "@/components/settings-client";
import { loadData } from "@/lib/data";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const data = await loadData(supabase);
  const { data: auth } = await supabase.auth.getUser();
  return (
    <div className="view">
      <section className="card">
        <div className="card-head"><h2>{t("settings.categories")}</h2></div>
        <CategoriesEditor categories={data.categories} />
        <p className="note">{t("settings.catNote")}</p>
      </section>

      <section className="card">
        <div className="card-head"><h2>{t("settings.export")}</h2></div>
        <div className="actions" style={{ marginTop: 0 }}>
          <a className="btn" href="/api/export/json" download>{t("settings.exportJson")}</a>
          <a className="btn" href="/api/export/assets" download>{t("settings.exportAssetsCsv")}</a>
          <a className="btn" href="/api/export/transactions" download>{t("portfolio.exportCsv")}</a>
        </div>
        <p className="note">{t("settings.exportNote")}</p>
      </section>

      <section className="card">
        <div className="card-head"><h2>{t("settings.importCsv")}</h2></div>
        <p className="note" style={{ marginTop: 0 }}>{t("settings.passPortfolio")}</p>
        <CsvImport />
      </section>

      <section className="card">
        <div className="card-head"><h2>{t("settings.restore")}</h2></div>
        <RestoreBackup />
      </section>

      <section className="card">
        <div className="card-head"><h2>{t("settings.account")}</h2><span className="mut" style={{ fontSize: 13 }}>{auth.user?.email}</span></div>
        <DeleteAccount />
      </section>
    </div>
  );
}
