import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const root = process.cwd();

export default defineConfig({
  root: path.resolve(root, "web"),
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(root, "shared")
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [root] }
  },
  build: {
    outDir: path.resolve(root, "dist-web"),
    emptyOutDir: true
  }
});
