import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,    // 區網內其他裝置可看（手機 / 平板測試用）
    open: true,    // npm run dev 時自動開瀏覽器
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // 為了之後嵌進 WordPress / 任意子路徑：build 完是相對路徑
    // 要絕對路徑就改成 '/'
    // base: './',
    chunkSizeWarningLimit: 1500,
  },
});
