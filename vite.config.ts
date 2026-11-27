import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Chemins relatifs : le site fonctionne à n'importe quelle adresse
  // (nom du dépôt modifié, racine, domaine personnalisé…) sans risque de page blanche.
  base: process.env.BASE_PATH || './',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
});
