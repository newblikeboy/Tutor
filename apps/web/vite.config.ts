import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'canonical-local-origin',
      configureServer(server) {
        // Keep local browser cookies and Origin on the address trusted by Go.
        // Redirect document navigation only; never rewrite an API request's Origin.
        server.middlewares.use((request, response, next) => {
          const address = server.httpServer?.address()
          if (
            address &&
            typeof address !== 'string' &&
            address.address === '127.0.0.1' &&
            !server.config.server.https &&
            request.headers.host === `localhost:${address.port}` &&
            (request.method === 'GET' || request.method === 'HEAD') &&
            request.headers.accept?.includes('text/html') &&
            request.url?.startsWith('/') &&
            !request.url.startsWith('/api/')
          ) {
            response.writeHead(307, {
              Location: `http://127.0.0.1:${address.port}${request.url}`,
              'Cache-Control': 'no-store',
            })
            response.end()
            return
          }
          next()
        })
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': process.env.API_TARGET ?? 'http://127.0.0.1:8080' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
