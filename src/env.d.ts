/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_GITHUB_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
