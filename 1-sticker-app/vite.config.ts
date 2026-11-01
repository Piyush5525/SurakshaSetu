import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

/** Private IPv4 addresses of this computer, so QR stickers work from a phone on the same Wi-Fi. */
function lanIps(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list ?? []) {
      if (
        n.family === 'IPv4' &&
        !n.internal &&
        /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(n.address)
      )
        out.push(n.address);
    }
  }
  return out;
}

// Pure modules in functions/src (types, board whitelist, receipt code) are shared with the browser.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __LAN_IPS__: JSON.stringify(lanIps()) },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../functions/src', import.meta.url)),
      '@common': fileURLToPath(new URL('../packages/common/src', import.meta.url)),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom', 'firebase', 'i18next', 'react-i18next'],
  },
  server: { host: true, port: 5174, fs: { allow: ['..'] } },
});
