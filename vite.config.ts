
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // loadEnv searches for variables starting with VITE_ by default.
  // Passing '' as the third argument allows it to load any environment variable.
  const env = loadEnv(mode, process.cwd(), '');
  
  // Explicitly fallback to actual process.env for CI/CD environments like Vercel
  const apiKey = env.API_KEY || process.env.API_KEY || '';
  
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(apiKey)
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', '@google/genai']
          }
        }
      }
    }
  };
});
