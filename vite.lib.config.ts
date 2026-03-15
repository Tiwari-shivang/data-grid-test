import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: 'dist/lib',
    lib: {
      entry: resolve(__dirname, 'src/lib/index.ts'),
      name: 'TiwariGrid',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'tiwari-grid.mjs' : 'tiwari-grid.cjs'),
    },
    rollupOptions: {
      external: [
        'react',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom',
        '@mui/material',
        '@mui/material/styles',
        '@mui/x-data-grid-premium',
        '@emotion/react',
        '@emotion/styled',
      ],
    },
  },
});
