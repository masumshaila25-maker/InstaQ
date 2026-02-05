
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// Import process from node:process to resolve typing issues with process.cwd()
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // লোড এনভায়রনমেন্ট ভ্যারিয়েবল
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // এটি ক্লায়েন্ট সাইডে process.env.API_KEY সহজলভ্য করবে
      'process.env.API_KEY': JSON.stringify(env.API_KEY || '')
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});
