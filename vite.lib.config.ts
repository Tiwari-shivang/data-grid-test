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
      fileName: (format) =>
        format === 'es' ? 'tiwari-grid.es.js' : 'tiwari-grid.cjs.js',
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        '@mui/material',
        '@mui/material/styles',
        '@mui/x-data-grid-premium',
        '@emotion/react',
        '@emotion/styled',
      ],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          '@mui/material': 'MaterialUI',
          '@mui/material/styles': 'MaterialUIStyles',
          '@mui/x-data-grid-premium': 'MuiDataGridPremium',
          '@emotion/react': 'EmotionReact',
          '@emotion/styled': 'EmotionStyled',
        },
      },
    },
  },
});
