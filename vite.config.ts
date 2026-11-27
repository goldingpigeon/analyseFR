import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Sur GitHub Pages, le site est servi sous /permis-construire/ (BASE_PATH fourni par le workflow).
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
});
