import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In Docker Compose, the frontend container cannot reach localhost:8000
// (that's the container itself). It must use the backend service name.
// We allow override via env vars; default works for local dev.
const API_TARGET = process.env.VITE_API_TARGET || "http://localhost:8000";
const WS_TARGET = process.env.VITE_WS_TARGET || "ws://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/ws": {
        target: WS_TARGET,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500,
  },
});
