// Solvespace WASM loader.
//
// Two paths:
//   - Browser: inject script tags pointing at the Vite-served URLs in
//     /solvespace/. The Emscripten loader and the wrapper are written to
//     publish themselves on `window.createSolveSpace` and
//     `window.SolveSpace` when run as non-module <script>s.
//   - Node (vitest): import the `solvespace-wasm` npm package, which
//     re-exports the Emscripten loader + wrapper as a single CommonJS
//     entry. ESM-to-CJS interop handles the `.default` shape.
//
// Returns a fully-prepared { module, System, makeQuaternion, C, RESULT,
// FREE_IN_3D } record that the rest of the solver consumes.

export type SolveSpaceApi = {
  module: any;
  System: new (mod: any) => any;
  makeQuaternion: (mod: any, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number) => [number, number, number, number];
  C: Record<string, number>;
  RESULT: { OKAY: 0; INCONSISTENT: 1; DIDNT_CONVERGE: 2; TOO_MANY_UNKNOWNS: 3 };
  FREE_IN_3D: 0;
};

let cachedApi: SolveSpaceApi | null = null;
let inFlight: Promise<SolveSpaceApi> | null = null;

const BROWSER_BASE = '/solvespace';

declare const window: any;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = src;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(tag);
  });
}

async function loadInBrowser(): Promise<SolveSpaceApi> {
  // The Emscripten loader exposes `var createSolveSpace = ...` which becomes
  // `window.createSolveSpace` when run as a non-module <script>. The wrapper
  // sets `window.SolveSpace = { System, makeQuaternion, ... }`. Vite serves
  // both files via the solvespace plugin (see ui/vite.config.ts).
  if (!window.createSolveSpace) {
    await injectScript(`${BROWSER_BASE}/solvespace.js`);
  }
  if (!window.SolveSpace) {
    await injectScript(`${BROWSER_BASE}/wrapper.js`);
  }
  const create = window.createSolveSpace as (opts?: any) => Promise<any>;
  const mod = await create({
    locateFile: (name: string) => `${BROWSER_BASE}/${name}`,
  });
  const slv = window.SolveSpace as Pick<SolveSpaceApi, 'System' | 'makeQuaternion' | 'C' | 'RESULT' | 'FREE_IN_3D'>;
  return {
    module: mod,
    System: slv.System,
    makeQuaternion: slv.makeQuaternion,
    C: slv.C,
    RESULT: slv.RESULT,
    FREE_IN_3D: slv.FREE_IN_3D,
  };
}

async function loadInNode(): Promise<SolveSpaceApi> {
  // Node / vitest path: use the npm package's CJS entry point.
  // The `@vite-ignore` keeps Vite from statically bundling the CJS
  // package into the browser output — `loadInNode` only runs under
  // Node (vitest); the browser path uses script-tag injection.
  // ESM-to-CJS interop puts the named exports on the imported namespace
  // (and also under .default in older Node versions); we read both
  // defensively.
  const moduleName = 'solvespace-wasm';
  const ns: any = await import(/* @vite-ignore */ moduleName);
  const api = ns.default && typeof ns.default === 'object' && ns.createSolveSpace === undefined
    ? ns.default
    : ns;
  const mod = await api.createSolveSpace();
  return {
    module: mod,
    System: api.System,
    makeQuaternion: api.makeQuaternion,
    C: api.C,
    RESULT: api.RESULT,
    FREE_IN_3D: api.FREE_IN_3D,
  };
}

export async function loadSolveSpace(): Promise<SolveSpaceApi> {
  if (cachedApi) return cachedApi;
  if (inFlight) return inFlight;
  inFlight = (isBrowser() ? loadInBrowser() : loadInNode())
    .then((api) => {
      cachedApi = api;
      inFlight = null;
      return api;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });
  return inFlight;
}

/** Synchronous accessor — returns null until `loadSolveSpace()` resolves. */
export function getLoadedSolveSpace(): SolveSpaceApi | null {
  return cachedApi;
}
