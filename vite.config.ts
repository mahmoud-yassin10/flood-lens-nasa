import { defineConfig } from "vite";
// ⛔️ wrong: import react from "@vitejs/plugin-react";
// ✅ right:
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  // make assets resolve correctly on GitHub Pages
  base: "/flood-lens-nasa/",
});
