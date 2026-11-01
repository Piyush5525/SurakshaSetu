import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Pure modules in functions/src (types, board whitelist, receipt code) are shared with the browser.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('../../functions/src', import.meta.url)) } },
  server: { port: 5173, fs: { allow: ['../..'] } },
});
