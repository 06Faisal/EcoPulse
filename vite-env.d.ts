/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;

  /** Backend Gemini proxy origin. Preferred in every deployed environment. */
  readonly VITE_AI_PROXY_URL?: string;
  /** Local development only — ignored in production builds (it would ship in the bundle). */
  readonly VITE_GEMINI_API_KEY?: string;

  readonly VITE_ML_ENABLED?: string;
  readonly VITE_ML_API_URL?: string;
  readonly VITE_ML_API_KEY?: string;

  /** Comma-separated extra hostnames the dev server may be reached under. */
  readonly VITE_DEV_ALLOWED_HOSTS?: string;

  /** Dev-only seeding/diagnostic flags. */
  readonly VITE_SEED_TEST_DATA?: string;
  readonly VITE_CLEAR_SEED_DATA?: string;
  readonly VITE_AUTO_ANALYZE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
