/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DETOKENIZER_API_URL?: string;
  readonly VITE_DETOKENIZER_AUTH_TOKEN?: string;
  readonly VITE_ALLOW_HTTP_DEV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
