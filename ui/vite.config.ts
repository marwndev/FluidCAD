import { defineConfig, type Plugin } from 'vite';
import path from 'path';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import tailwindcss from '@tailwindcss/vite';

// Resolve the solvespace-wasm package from node_modules so the path follows
// the symlink (file:../solvespace-wasm) without us hardcoding it.
const require = createRequire(import.meta.url);
const SOLVESPACE_PKG_PATH = require.resolve('solvespace-wasm/package.json');
const SOLVESPACE_PKG_ROOT = path.dirname(SOLVESPACE_PKG_PATH);

// Maps the URL path served at `/solvespace/<name>` to the on-disk file
// inside the npm package. The wrapper lives at `wasm/index.js` upstream
// but we serve it as `/solvespace/wrapper.js` so the URL doesn't conflict
// with `solvespace.js` (the Emscripten loader).
const SOLVESPACE_FILES: Record<string, string> = {
  'solvespace.js': path.join(SOLVESPACE_PKG_ROOT, 'dist/solvespace.js'),
  'solvespace.wasm': path.join(SOLVESPACE_PKG_ROOT, 'dist/solvespace.wasm'),
  'wrapper.js': path.join(SOLVESPACE_PKG_ROOT, 'wasm/index.js'),
};

/**
 * Serves the solvespace-wasm files at `/solvespace/<file>` so the UI can
 * dynamically inject the Emscripten loader and fetch the .wasm at runtime.
 * Avoids duplicating the files into ui/public/ and avoids static-import
 * issues with the Emscripten loader's Node-specific top-level code.
 */
function solvespacePlugin(): Plugin {
  return {
    name: 'fluidcad-solvespace-vendor',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        const match = url.match(/^\/solvespace\/([^?#]+)/);
        if (!match) return next();
        const file = match[1];
        const src = SOLVESPACE_FILES[file];
        if (!src) return next();
        try {
          const data = await readFile(src);
          const mime = file.endsWith('.wasm')
            ? 'application/wasm'
            : 'application/javascript; charset=utf-8';
          res.setHeader('Content-Type', mime);
          res.setHeader('Cache-Control', 'no-cache');
          res.end(data);
        } catch (err) {
          next(err as Error);
        }
      });
    },
    async generateBundle() {
      for (const [name, src] of Object.entries(SOLVESPACE_FILES)) {
        const source = await readFile(src);
        this.emitFile({
          type: 'asset',
          fileName: `solvespace/${name}`,
          source,
        });
      }
    },
  };
}

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  plugins: [tailwindcss(), solvespacePlugin()],
  server: {
    port: 3200
  },
  build: {
    outDir: 'dist'
  }
});
