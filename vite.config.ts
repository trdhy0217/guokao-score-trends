import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base 路径：
//   - 本地开发 / 预览默认 '/'
//   - GitHub Pages 项目页位于 https://<user>.github.io/<repo>/ 子路径，
//     由 GitHub Actions 注入环境变量 VITE_BASE=/<repo>/ 实现正确的资源路径。
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  build: {
    // 单独拆出较大的第三方依赖，优化首屏加载
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers'],
        },
      },
    },
  },
})
