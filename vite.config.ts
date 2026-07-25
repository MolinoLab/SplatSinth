import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  worker: { format: "es" },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        // Spark lleva su WASM incrustado y Monaco es enorme: separarlos permite
        // descargarlos en paralelo y cachearlos entre despliegues.
        manualChunks(id) {
          if (id.includes("@sparkjsdev")) return "spark";
          if (id.includes("monaco-editor")) return "monaco";
          if (id.includes("node_modules/three")) return "three";
        },
      },
    },
  },
});
