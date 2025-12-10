import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';

// Custom plugin to copy static files
function copyStaticFiles() {
  return {
    name: 'copy-static-files',
    closeBundle() {
      const distDir = 'dist';
      
      // Files to copy directly
      const filesToCopy = [
        'manifest.json',
        'devtools.html',
        'devtools.js',
        'panel.html',
        'panel.css',
        'content.js',
        'background.js',
      ];
      
      filesToCopy.forEach(file => {
        if (existsSync(file)) {
          copyFileSync(file, `${distDir}/${file}`);
        }
      });
      
      // Copy icons folder
      if (existsSync('icons')) {
        if (!existsSync(`${distDir}/icons`)) {
          mkdirSync(`${distDir}/icons`, { recursive: true });
        }
        readdirSync('icons').forEach(file => {
          copyFileSync(`icons/${file}`, `${distDir}/icons/${file}`);
        });
      }
      
      // Copy lib folder
      if (existsSync('lib')) {
        if (!existsSync(`${distDir}/lib`)) {
          mkdirSync(`${distDir}/lib`, { recursive: true });
        }
        readdirSync('lib').forEach(file => {
          copyFileSync(`lib/${file}`, `${distDir}/lib/${file}`);
        });
      }
      
      // Copy panel folder
      if (existsSync('panel')) {
        if (!existsSync(`${distDir}/panel`)) {
          mkdirSync(`${distDir}/panel`, { recursive: true });
        }
        readdirSync('panel').forEach(file => {
          copyFileSync(`panel/${file}`, `${distDir}/panel/${file}`);
        });
      }
    }
  };
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
    rollupOptions: {
      input: {
        inject: resolve(__dirname, 'src/inject.js'),
      },
      output: {
        entryFileNames: '[name].js',
        format: 'iife',
      },
    },
    sourcemap: false,
    minify: false,
  },
  plugins: [copyStaticFiles()],
});

