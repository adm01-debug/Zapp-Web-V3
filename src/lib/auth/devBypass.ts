/**
 * devBypass.ts — Whitelist de ambiente para o bypass do papel `dev` (E51).
 *
 * O papel `dev` concedia acesso irrestrito a rotas protegidas em QUALQUER
 * ambiente. A partir de E51 o bypass só é permitido em ambientes allowlisted:
 *
 *   development | staging  → bypass permitido
 *   production  | test     → bypass BLOQUEADO (RBAC explícito obrigatório)
 *
 * Leitura única de ambiente (51.3): `VITE_APP_ENV` (declarado no build) tem
 * precedência; sem ele, usa `import.meta.env.MODE` (modo do Vite — dev server
 * roda `development`, builds de produção rodam `production`); nada reconhecido
 * → `production` (default seguro, fail-closed).
 *
 * Evidência de builds de produção (VITE_APP_ENV=production): Dockerfile:20 e
 * .github/workflows/deploy-vps*.yml.
 */

export type AppEnv = 'development' | 'staging' | 'production' | 'test';

/** Ambientes em que o bypass do papel `dev` é permitido (allowlist). */
const DEV_BYPASS_ALLOWED_ENVS: ReadonlySet<AppEnv> = new Set(['development', 'staging']);

const KNOWN_ENVS: ReadonlySet<string> = new Set(['development', 'staging', 'production', 'test']);

/**
 * Resolve o ambiente efetivo a partir das fontes brutas (função pura, testável).
 * `VITE_APP_ENV` explícito vence; valor inválido/vazio cai para `MODE`;
 * nada reconhecido → 'production' (fail-closed).
 */
export function resolveAppEnv(appEnvRaw: string | undefined, modeRaw: string | undefined): AppEnv {
  const appEnv = appEnvRaw?.trim() ?? '';
  if (KNOWN_ENVS.has(appEnv)) return appEnv as AppEnv;
  const mode = modeRaw?.trim() ?? '';
  if (KNOWN_ENVS.has(mode)) return mode as AppEnv;
  return 'production';
}

/** Decisão pura: o bypass do papel `dev` é permitido neste ambiente? */
export function isDevBypassAllowedForEnv(env: AppEnv): boolean {
  return DEV_BYPASS_ALLOWED_ENVS.has(env);
}

/** Ambiente efetivo atual (leitura única de import.meta.env). */
export function getAppEnv(): AppEnv {
  return resolveAppEnv(
    import.meta.env.VITE_APP_ENV as string | undefined,
    import.meta.env.MODE as string | undefined
  );
}

/** O bypass do papel `dev` está permitido no ambiente atual? */
export function isDevBypassAllowed(): boolean {
  return isDevBypassAllowedForEnv(getAppEnv());
}
