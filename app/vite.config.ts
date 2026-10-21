import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command, mode }) => ({
  base: command === "build" && mode !== "test" ? "/Control_Finance/" : "/",
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 300,
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-180.png", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Control Finance",
        short_name: "Control",
        description: "Tus finanzas personales, claras y privadas.",
        lang: "es",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0B0D12",
        theme_color: "#0B0D12",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        navigateFallback: "index.html",
      },
    }),
  ],
}));
