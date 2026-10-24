import type { MetadataRoute } from "next";
import { t } from "@/lib/i18n";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: t("app.name"),
    short_name: t("app.name"),
    description: t("app.tagline"),
    start_url: "/",
    display: "standalone",
    background_color: "#edf1ef",
    theme_color: "#0d7a64",
    lang: "it",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
