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
