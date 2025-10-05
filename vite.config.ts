import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // IMPORTANT for GitHub Pages: must match your repo slug
  const base = env.VITE_PUBLIC_BASE || "/flood-lens-nasa/";

  return {
    base,
    server: { host: "::", port: 8080 },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    build: { outDir: "dist", sourcemap: true },
  };
});
