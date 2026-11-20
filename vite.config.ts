import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    // 允许在线预览域名访问开发服务器
    allowedHosts: ['.monkeycode-ai.online']
  },
  build: {
    target: 'es2022',
    sourcemap: false
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default']
  }
})
