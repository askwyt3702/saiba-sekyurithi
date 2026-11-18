import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 本番ビルドを、変わりにくいライブラリとゲームのデータに分けて出力する。
// 1つの大きなファイル(600kB超)だと読み込みが遅く、ビルドで警告も出ていた。
// 分けておくと、ゲームのコードだけ変えたときもライブラリ部分はブラウザのキャッシュが使える。
function splitChunk(id: string): string | undefined {
  const path = id.replace(/\\/g, '/');
  if (path.includes('/node_modules/')) {
    if (/\/node_modules\/(react|react-dom|scheduler)\//.test(path)) return 'react';
    if (/\/node_modules\/(@xyflow|d3-[^/]+|zustand|classcat)\//.test(path)) return 'react-flow';
    return 'vendor';
  }
  if (/\/src\/game\/data\/(securityLearningData|stageData)\.ts$/.test(path)) return 'game-data';
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: splitChunk,
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: true,
    },
  },
})