// Runtime configuration, read from `/config.json` when the app starts.
//
// On Codera, the platform writes `/config.json` into the deployed bucket for
// each environment. `backend.RestApiUrl` there is the `ApiUrl` output of THAT
// environment's backend stack (template.json `config_from`), so one build works
// in every environment and nothing is baked in at build time.
//
// Local dev (`npm run dev`): `public/config.json` ships with an empty
// `backend`, so the API URL falls back to `VITE_API_BASE_URL` (e.g. in
// `.env.local`), and to same-origin relative paths when that is unset too.

export interface AppConfig {
  backend: { RestApiUrl?: string };
  [key: string]: unknown;
}

let _config: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (_config) return _config;
  const res = await fetch("/config.json");
  if (!res.ok) throw new Error(`Failed to load config: ${res.status}`);
  const config = (await res.json()) as Partial<AppConfig>;
  _config = { ...config, backend: config.backend ?? {} };
  return _config;
}

export function getConfig(): AppConfig {
  if (!_config) throw new Error("Config not loaded — call loadConfig() first");
  return _config;
}

/**
 * The backend API base URL, without a trailing slash (a CDK `RestApi.url` ends
 * in `/`). `config.json` wins; `VITE_API_BASE_URL` is the local-dev fallback.
 */
export function apiBaseUrl(): string {
  const fromConfig = getConfig().backend.RestApiUrl;
  // `import.meta.env` is Vite-only; guard it so the module also loads under
  // plain Node (`npm test`).
  const fromEnv = import.meta.env?.VITE_API_BASE_URL as string | undefined;
  return (fromConfig || fromEnv || "").replace(/\/+$/, "");
}
