import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1internal': {
        target: 'https://daily-cloudcode-pa.googleapis.com',
        changeOrigin: true,
        headers: {
          'User-Agent':
            'antigravity/cli/1.4.12 (aidev_client; os_type=windows; arch=amd64; cl=1010700967; auth_method=consumer)'
        }
      }
    }
  }
});
