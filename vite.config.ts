import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Injects a Content-Security-Policy into the built index.html.
 *
 * Build-only on purpose: Vite's dev server injects an inline HMR preamble that
 * `script-src 'self'` would block, so applying the same policy in dev would
 * break local development without making the shipped app any safer.
 */
const csp = (env: Record<string, string>): Plugin => {
  const configuredOrigins = [
    env.VITE_SUPABASE_URL,
    env.VITE_ML_API_URL,
    env.VITE_AI_PROXY_URL
  ]
    .filter(Boolean)
    .map((url) => {
      try {
        return new URL(url).origin;
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  const connectSrc = [
    "'self'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://generativelanguage.googleapis.com',
    'https://nominatim.openstreetmap.org',
    ...configuredOrigins
  ];

  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // Tailwind and Recharts both emit inline style attributes.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: blob:",
    `connect-src ${[...new Set(connectSrc)].join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');

  return {
    name: 'ecopulse-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}">`
      );
    }
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    server: {
      port: 5173,
      // Bind loopback by default. Serving the dev server on 0.0.0.0 exposes
      // your source and env-injected values to the whole local network; opt in
      // explicitly with `npm run dev -- --host` when testing on a phone.
      host: 'localhost',
      // `allowedHosts: true` switches off Host-header checking, which lets any
      // website reach this dev server via DNS rebinding. Keep the default
      // allowlist and extend it through VITE_DEV_ALLOWED_HOSTS for tunnels.
      allowedHosts: (env.VITE_DEV_ALLOWED_HOSTS || '')
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean),
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true
        }
      }
    },
    plugins: [react(), csp(env)],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            recharts: ['recharts'],
            supabase: ['@supabase/supabase-js']
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.')
      }
    }
  };
});
