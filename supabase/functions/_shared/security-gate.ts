/**
 * security-gate.ts — Gate de segurança de LOGIN (SEGURANCA-04 + SEGURANCA-05).
 *
 * Enforcement de políticas de acesso no handler de login:
 *   - zapp.blocked_ips        → IP bloqueado (permanente ou expirado) nega login.
 *   - zapp.ip_whitelist       → se a whitelist NÃO está vazia, só IPs listados passam.
 *   - zapp.geo_blocking_settings + zapp.allowed_countries / zapp.blocked_countries
 *                               → modo whitelist exige país em allowed_countries;
 *                                 modo blacklist nega países em blocked_countries.
 *
 * Fonte de país: headers de CDN/proxy (CF-IPCountry da Cloudflare, x-vercel-ip-country,
 * x-country-code do Kong/GoTrue). Sem header de país disponível → NÃO bloqueia
 * (fail-open) mas sinaliza via `geoUnavailable` + console.warn (não há fonte de
 * geo-lookup no runtime edge self-hosted; um lookup externo exigiria API paga e
 * adicionaria latência — sinalizado para decisão de produto).
 *
 * Falhas de query (DB fora/ex-tabela ausente) → fail-open com log de erro: um erro
 * transiente de leitura NUNCA pode derrubar o login de todos os usuários (self-DoS).
 * O trade-off de segurança (whitelist/blacklist desarmada durante falha de DB) é
 * aceito em favor de disponibilidade; o erro é logado para alerta.
 *
 * Uso (padrão das edges):
 *   import { checkLoginSecurityGate, getClientCountry } from "../_shared/security-gate.ts";
 *   const admin = createZappAdminClient();
 *   const gate = await checkLoginSecurityGate(req, admin);
 *   if (!gate.allowed) return errorResponse("Acesso bloqueado...", 403, req, { code: gate.reason });
 */
import { getClientIP } from "./validation.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/** Client admin (service role) do schema zapp — tipado como o db-client.ts. */
// deno-lint-ignore no-explicit-any
export type ZappAdminClient = SupabaseClient<any, "zapp">;

/** Códigos de bloqueio — consumidos pelo frontend para mensagens amigáveis. */
export type LoginBlockReason =
  | "ip_blocked"
  | "ip_not_whitelisted"
  | "country_blocked"
  | "country_not_allowed";

export interface SecurityGateResult {
  /** true = pode prosseguir com o login. */
  allowed: boolean;
  /** Motivo do bloqueio quando allowed=false. */
  reason?: LoginBlockReason;
  /** IP do cliente (normalizado, pode ser "unknown"). */
  ip: string;
  /** País do cliente (ISO 3166-1 alpha-2) ou null se indisponível. */
  country: string | null;
  /**
   * true = geo-blocking está ativo (whitelist/blacklist) mas NÃO há fonte de país
   * no request. Sinalização: o login NÃO é bloqueado, mas a ausência de header
   * deve ser monitorada (sem CF-IPCountry, a política geográfica não pode operar).
   */
  geoUnavailable: boolean;
}

/** Headers de país suportados: Cloudflare, Vercel, Kong/GoTrue, proxies genéricos. */
const COUNTRY_HEADERS = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "x-country-code",
  "x-ip-country",
] as const;

/**
 * Extrai o país do cliente a partir de headers de CDN/proxy.
 * Retorna código ISO 3166-1 alpha-2 em maiúsculas, ou null quando ausente/inválido.
 */
export function getClientCountry(req: Request): string | null {
  for (const header of COUNTRY_HEADERS) {
    const value = req.headers.get(header)?.trim();
    if (value && /^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  }
  return null;
}

/** Compara IPs de forma case-insensitive (IPv6 normalizado em lowercase). */
const sameIp = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Verifica as políticas de segurança de login (blocked_ips, ip_whitelist, geo).
 * Consulta direta via service role (cliente admin schema zapp).
 */
export async function checkLoginSecurityGate(
  req: Request,
  admin: ZappAdminClient,
): Promise<SecurityGateResult> {
  const ip = getClientIP(req);
  const result: SecurityGateResult = {
    allowed: true,
    ip,
    country: getClientCountry(req),
    geoUnavailable: false,
  };

  // ── 1) blocked_ips: bloqueio manual + rate-limit (permanente ou não expirado) ──
  try {
    const { data, error } = await admin
      .from("blocked_ips")
      .select("is_permanent, expires_at")
      .eq("ip_address", ip)
      .limit(1);
    if (error) {
      console.error(`[security-gate] blocked_ips query failed (fail-open): ${error.message}`);
    } else {
      const row = data?.[0] ?? null;
      if (row) {
        const expired = row.expires_at != null && Date.parse(row.expires_at) <= Date.now();
        if (row.is_permanent === true || !expired) {
          result.allowed = false;
          result.reason = "ip_blocked";
          return result;
        }
      }
    }
  } catch (e) {
    console.error(`[security-gate] blocked_ips check threw (fail-open): ${String(e)}`);
  }

  // ── 2) ip_whitelist: whitelist NÃO vazia ⇒ somente IPs listados passam ──
  try {
    const { data, error } = await admin.from("ip_whitelist").select("ip_address");
    if (error) {
      console.error(`[security-gate] ip_whitelist query failed (fail-open): ${error.message}`);
    } else if (data && data.length > 0) {
      const isListed = data.some((row) => row.ip_address != null && sameIp(row.ip_address, ip));
      if (!isListed) {
        // IP desconhecido com whitelist ativa = nega (fail-closed, como especificado:
        // "se ip_whitelist não vazia, só permite IPs listados").
        result.allowed = false;
        result.reason = "ip_not_whitelisted";
        return result;
      }
    }
  } catch (e) {
    console.error(`[security-gate] ip_whitelist check threw (fail-open): ${String(e)}`);
  }

  // ── 3) geo-blocking: settings.mode = disabled | whitelist | blacklist ──
  try {
    const { data, error } = await admin
      .from("geo_blocking_settings")
      .select("mode")
      .limit(1);
    if (error) {
      console.error(`[security-gate] geo_blocking_settings query failed (fail-open): ${error.message}`);
      return result;
    }
    const mode = data?.[0]?.mode ?? "disabled";
    if (mode === "disabled") return result;

    const country = result.country;
    if (!country) {
      // Sinalização (SEGURANCA-05): sem header de país, a política geográfica
      // não pode operar. Não bloqueia (fail-open), mas avisa em log.
      result.geoUnavailable = true;
      console.warn(
        `[security-gate] geo mode=${mode} ativo mas sem header de país (CF-IPCountry ausente) — login liberado com geoUnavailable`,
      );
      return result;
    }

    if (mode === "whitelist") {
      const { data: allowed, error: allowedError } = await admin
        .from("allowed_countries")
        .select("country_code");
      if (allowedError) {
        console.error(`[security-gate] allowed_countries query failed (fail-open): ${allowedError.message}`);
        return result;
      }
      const isAllowed = (allowed ?? []).some(
        (row) => row.country_code != null && row.country_code.toUpperCase() === country,
      );
      if (!isAllowed) {
        result.allowed = false;
        result.reason = "country_not_allowed";
        return result;
      }
    } else {
      // mode === "blacklist"
      const { data: blocked, error: blockedError } = await admin
        .from("blocked_countries")
        .select("country_code");
      if (blockedError) {
        console.error(`[security-gate] blocked_countries query failed (fail-open): ${blockedError.message}`);
        return result;
      }
      const isBlocked = (blocked ?? []).some(
        (row) => row.country_code != null && row.country_code.toUpperCase() === country,
      );
      if (isBlocked) {
        result.allowed = false;
        result.reason = "country_blocked";
        return result;
      }
    }
  } catch (e) {
    console.error(`[security-gate] geo check threw (fail-open): ${String(e)}`);
  }

  return result;
}
