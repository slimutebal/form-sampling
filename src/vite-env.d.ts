/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Build-time constant injected by `vite.config.ts` from package.json's version. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string
  /** Google Apps Script Web App endpoint for master-data reads. */
  readonly VITE_GOOGLE_APPS_SCRIPT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
