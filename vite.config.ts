import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // IMPORTANT: set to your repo name (project pages)
  base: "/flood-lens-nasa/",
});
