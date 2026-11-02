/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Integration version from manifest.json, injected at build time by Vite. */
declare const __SKYDARK_VERSION__: string;
