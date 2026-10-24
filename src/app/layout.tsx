import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { t } from "@/lib/i18n";
import "./globals.css";

const ui = Schibsted_Grotesk({ variable: "--font-schibsted", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: t("app.name"),
  description: t("app.tagline"),
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: t("app.name"), statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0d7a64" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${ui.variable} ${mono.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
