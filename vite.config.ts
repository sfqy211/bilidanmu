import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src",
  plugins: [react()],
  base: "/",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    // 拆出体积较大的第三方库，避免单个 chunk 过大拖慢冷启动解析。
    // 页面本身已按路由懒加载（见 src/router.tsx），这里只处理共享依赖。
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: "vendor-react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "vendor-router", test: /node_modules[\\/]react-router/ },
            { name: "vendor-radix", test: /node_modules[\\/]@radix-ui[\\/]/ },
            { name: "vendor-mpegts", test: /node_modules[\\/]mpegts\.js[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
});
