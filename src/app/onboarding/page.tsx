import { redirect } from "next/navigation";
import { OnboardingForm } from "./onboarding-form";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("onboarded").eq("user_id", data.user.id).single();
  if (profile?.onboarded) redirect("/");
  return (
    <main className="login view">
      <div>
        <h1>{t("onboarding.title")}</h1>
        <p className="sub">{t("onboarding.sub")}</p>
      </div>
      <OnboardingForm />
      <p className="foot">{t("disclaimer")}</p>
    </main>
  );
}
