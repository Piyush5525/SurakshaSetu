import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// PWA manifest/service worker arrive in M2 (offline queue is P2).
export default defineConfig({ plugins: [react(), tailwindcss()], server: { port: 5173 } });
