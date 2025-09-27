import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.js',
      name: 'barelytics',
      fileName: () => 'script.js',
      formats: ['iife']
    },
    rollupOptions: {
      output: {
        extend: true,
      }
    },
    minify: 'terser',
    outDir: 'dist'
  }
});