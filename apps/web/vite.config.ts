import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@projecta/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@projecta/types': path.resolve(__dirname, '../../packages/types/src'),
    },
  },
  server: {
    port: 5173,
    // Vite 8 auto-enables this when launched under an agent (e.g. Claude Code).
    // It registers unhandledrejection/error listeners that call ws.send(); if the
    // HMR socket is dropped, ws is undefined and the forwarder's own rejection
    // re-fires the listener, looping until the tab OOMs. Disable explicitly.
    forwardConsole: false,
    proxy: {
      '/api/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        // AI generation against a local LLM can take 20-60s for long-form
        // outputs (release notes, executive summaries). Default proxy timeout
        // would 502 those calls. Bump to 5 min in dev.
        timeout: 300000,
        proxyTimeout: 300000,
      },
    },
  },
});
