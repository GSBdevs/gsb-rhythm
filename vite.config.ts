import { defineConfig } from 'vite';

// base './' é obrigatório: sob file:// (Electron) assets absolutos /assets/ dão 404.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor.html',
      },
    },
  },
});
