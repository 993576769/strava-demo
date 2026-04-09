import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

const parsePort = (value?: string) => {
  if (!value) return undefined
  const port = Number.parseInt(value, 10)
  return Number.isFinite(port) ? port : undefined
}

const resolveHmrConfig = (env: Record<string, string>) => {
  const host = env.VITE_HMR_HOST
  const protocol = env.VITE_HMR_PROTOCOL as 'ws' | 'wss' | undefined
  const port = parsePort(env.VITE_HMR_PORT)
  const clientPort = parsePort(env.VITE_HMR_CLIENT_PORT)

  if (!host && !protocol && !port && !clientPort) {
    return {
      host: '127.0.0.1',
      clientPort: parsePort(env.VITE_DEV_PORT) ?? 5173
    }
  }

  return {
    ...(host ? { host } : {}),
    ...(protocol ? { protocol } : {}),
    ...(port ? { port } : {}),
    ...(clientPort ? { clientPort } : {})
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devPort = parsePort(env.VITE_DEV_PORT) ?? 5173

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      host: env.VITE_DEV_HOST || '0.0.0.0',
      port: devPort,
      strictPort: true,
      hmr: resolveHmrConfig(env),
      proxy: {
        '/api': {
          target: 'http://localhost:8090',
          changeOrigin: true
        },
        '/realtime': {
          target: 'http://localhost:8090',
          ws: true,
          changeOrigin: true
        },
        '/_': {
          target: 'http://localhost:8090',
          changeOrigin: true
        }
      }
    }
  }
})
