import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

/** First private IPv4 address of this computer, so QR stickers work from a phone on the same Wi-Fi. */
function lanIp(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list ?? []) {
      if (n.family === 'IPv4' && !n.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(n.address))
        return n.address;
    }
  }
  return '';
}

// Pure modules in functions/src (types, board whitelist, receipt code) are shared with the browser.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __LAN_IP__: JSON.stringify(lanIp()) },
  resolve: { alias: { '@shared': fileURLToPath(new URL('../../functions/src', import.meta.url)) } },
  server: { host: true, port: 5173, fs: { allow: ['../..'] } },
});
