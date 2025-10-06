// vite.config.mts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // IMPORTANT for GitHub Pages project site:
  // https://mahmoud-yassin10.github.io/flood-lens-nasa/
  base: '/flood-lens-nasa/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
