import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { copyFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';

function copyStaticFiles() {
  return {
    name: 'copy-static-files',
    closeBundle() {
      const distDir = 'dist';
      
      const filesToCopy = [
        'manifest.json',
        'devtools.html',
        'devtools.js',
        'content.js',
        'background.js',
        'inject.js',
      ];
      
      filesToCopy.forEach(file => {
        if (existsSync(file)) {
          copyFileSync(file, `${distDir}/${file}`);
        }
      });
      
      if (existsSync('icons')) {
        if (!existsSync(`${distDir}/icons`)) {
          mkdirSync(`${distDir}/icons`, { recursive: true });
        }
        readdirSync('icons').forEach(file => {
          copyFileSync(`icons/${file}`, `${distDir}/icons/${file}`);
        });
      }
      
      if (existsSync('lib')) {
        if (!existsSync(`${distDir}/lib`)) {
          mkdirSync(`${distDir}/lib`, { recursive: true });
        }
        readdirSync('lib').forEach(file => {
          copyFileSync(`lib/${file}`, `${distDir}/lib/${file}`);
        });
      }
      
      const panelHtml = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <title>MobX DevTools</title>
  <link rel="stylesheet" href="./panel.css">
</head>
<body>
  <div id="app"></div>
  <script src="./panel.js"></script>
</body>
</html>`;
      writeFileSync(`${distDir}/panel.html`, panelHtml);
    }
  };
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
    lib: {
      entry: resolve(__dirname, 'panel/main.js'),
      name: 'MobXDevToolsPanel',
      fileName: () => 'panel.js',
      formats: ['iife'],
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: 'panel.[ext]',
      },
    },
    sourcemap: true,
    minify: false,
  },
  plugins: [
    svelte(),
    copyStaticFiles()
  ],
});
