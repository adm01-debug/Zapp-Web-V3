#!/usr/bin/env node
/**
 * Gate de build — secrets obrigatórios de deploy.
 *
 * Bloqueia o build/deploy quando SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_DB_URL
 * não estão presentes. Também valida os secrets de runtime do frontend e
 * impede apontar para Lovable Cloud (*.supabase.co) — o projeto exige a
 * instância self-hosted.
 *
 * Enforcement:
 *   - Falha (exit 1) quando DEPLOY=true ou ENFORCE_DEPLOY_SECRETS=1 (pipeline de deploy).
 *   - Em build local/CI de PR apenas avisa, para não travar dev e checks de qualidade.
 *     Use SKIP_DEPLOY_SECRETS_CHECK=1 para silenciar por completo.
 */

const HINTS = {
  SUPABASE_SERVICE_ROLE_KEY: 'service role key da instância self-hosted (nunca no frontend)',
  SUPABASE_DB_URL: 'postgres://user:senha@host:5432/postgres',
  VITE_SUPABASE_URL: 'https://supabase.atomicabr.com.br',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'chave anon/publishable da instância',
};

const REQUIRED = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
];

const truthy = (v) => typeof v === 'string' && v.trim() !== '' && v !== '0' && v !== 'false';

if (truthy(process.env.SKIP_DEPLOY_SECRETS_CHECK)) {
  process.exit(0);
}

const enforce =
  truthy(process.env.DEPLOY) || truthy(process.env.ENFORCE_DEPLOY_SECRETS);

const missing = REQUIRED.filter((name) => !truthy(process.env[name]));
const errors = missing.map((name) => `${name} ausente — esperado: ${HINTS[name]}`);

const url = process.env.VITE_SUPABASE_URL || '';
if (url.includes('.supabase.co')) {
  errors.push(
    'VITE_SUPABASE_URL aponta para Lovable Cloud (*.supabase.co). ZAPP web exige a VPS self-hosted.',
  );
}

// Validação da anon contra o Kong (fail-fast pré-build) — só no pipeline de deploy.
// Complementa o gate pré-PUT-stack: pega anon de OUTRO ambiente ANTES de gastar um build.
// Incidente 2026-08-20: VITE_SUPABASE_PUBLISHABLE_KEY trazia anon de outro ambiente (401 em prod).
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
if (enforce && truthy(anonKey) && truthy(url) && !url.includes('.supabase.co') && errors.length === 0) {
  try {
    const payload = JSON.parse(Buffer.from(anonKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (payload && (payload.role === 'service_role' || payload.role === 'service')) {
      errors.push('VITE_SUPABASE_PUBLISHABLE_KEY tem role=service_role — jamais no frontend.');
    }
  } catch { /* JWT ilegível: a aceitação pelo Kong abaixo pega */ }
  if (errors.length === 0) {
    let code = 0;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(15000) });
        code = r.status;
      } catch { code = 0; }
      if (code === 200) break;
      await new Promise((res) => setTimeout(res, 3000));
    }
    if (code !== 200) {
      errors.push(`VITE_SUPABASE_PUBLISHABLE_KEY rejeitada pelo Kong (auth/v1/settings=${code}, esperado 200) — anon de outro ambiente/chave errada.`);
    }
  }
}

if (errors.length === 0) {
  console.log('✅ check-deploy-secrets: todos os secrets críticos estão presentes.');
  process.exit(0);
}

const header = enforce
  ? '❌ Deploy bloqueado — configuração inválida de secrets'
  : '⚠️  Aviso local — secrets de deploy incompletos (build não bloqueado fora de CI)';

console.error('\n════════════════════════════════════════════════════════════════');
console.error(` ${header}`);
console.error('════════════════════════════════════════════════════════════════');
for (const err of errors) console.error(`  • ${err}`);
console.error('\n  Configure em: Settings → Secrets and variables → Actions');
console.error('════════════════════════════════════════════════════════════════\n');

process.exit(enforce ? 1 : 0);
