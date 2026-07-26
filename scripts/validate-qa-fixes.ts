/**
 * scripts/validate-qa-fixes.ts
 *
 * Script de validação automatizada dos 5 FIXes críticos aplicados.
 * Roda localmente para garantir que cada correção está no código.
 *
 * Uso: bun run scripts/validate-qa-fixes.ts
 * ou:  npx tsx scripts/validate-qa-fixes.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();

interface FixCheck {
  id: string;
  description: string;
  file: string;
  /** Strings que DEVEM existir no arquivo (todas) */
  mustContain: string[];
  /** Strings que NÃO devem existir (padrões de bug) */
  mustNotContain: string[];
}

const FIXES: FixCheck[] = [
  {
    id: 'FIX #1',
    description: 'role_permissions: select(permission_id, permissions!inner(name))',
    file: 'src/features/auth/components/AuthProvider.tsx',
    mustContain: [
      '.from(\'role_permissions\')',
      'permission_id, permissions!inner(name)',
      '.in(\'role\', roleNames)',
    ],
    mustNotContain: [
      '.from(\'role_permissions\').select(\'permission\')',
    ],
  },
  {
    id: 'FIX #2',
    description: 'automation_executions: 2 queries (sem join automations)',
    file: 'src/hooks/useAutomationSuggestions.ts',
    mustContain: [
      'FIX #2',
      '2 queries',
      'safeClient.from',
      'automations',
    ],
    mustNotContain: [
      // Não pode ter .select('...automations(name)...') mas pode ter
      // comentário // FIX #2: Join com automations(name) ... (explicação)
      '.select(\'id, rule_id, suggestion_text, recommended_tag, kb_sources, status, created_at, instance_name, remote_jid, automations(name)',
    ],
  },
  {
    id: 'FIX #3',
    description: 'contact_intelligence: conditional filter (UUID vs phone)',
    file: 'src/hooks/useContactIntelligence.ts',
    mustContain: [
      'FIX #3',
      'isValidUUID(contactIdOrPhone)',
      'contact_id.eq.',
      'phone.eq.',
    ],
    mustNotContain: [
      // Deve usar conditional, não fixo
    ],
  },
  {
    id: 'FIX #4',
    description: 'evolution_messages: usar remote_jid (não phone)',
    file: 'src/hooks/useContactIntelligence.ts',
    mustContain: [
      'FIX #4',
      'remote_jid',
    ],
    mustNotContain: [
      // phones em evolution_messages
    ],
  },
  {
    id: 'FIX #5',
    description: 'evolution-api: graceful degradation 5xx → 200',
    file: 'supabase/functions/evolution-api/index.ts',
    mustContain: [
      'FIX #5',
      'response.status >= 500',
      'status: \'unknown\'',
    ],
    mustNotContain: [],
  },
];

function checkFix(fix: FixCheck): { passed: boolean; errors: string[] } {
  const filePath = join(REPO_ROOT, fix.file);
  const errors: string[] = [];

  if (!existsSync(filePath)) {
    errors.push(`File not found: ${fix.file}`);
    return { passed: false, errors };
  }

  const content = readFileSync(filePath, 'utf-8');

  for (const pattern of fix.mustContain) {
    if (!content.includes(pattern)) {
      errors.push(`Missing required pattern: "${pattern}"`);
    }
  }

  for (const pattern of fix.mustNotContain) {
    if (content.includes(pattern)) {
      errors.push(`Found forbidden pattern: "${pattern}"`);
    }
  }

  return { passed: errors.length === 0, errors };
}

function main() {
  console.log('🔍 Validating 5 critical QA fixes in main branch...\n');

  let allPassed = true;
  let passedCount = 0;

  for (const fix of FIXES) {
    const { passed, errors } = checkFix(fix);
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${fix.id}: ${fix.description}`);

    if (passed) {
      passedCount++;
    } else {
      allPassed = false;
      for (const err of errors) {
        console.log(`     - ${err}`);
      }
    }
  }

  console.log(`\n${passedCount}/${FIXES.length} fixes verified in code`);

  if (allPassed) {
    console.log('\n✅ All 5 critical fixes are present in main branch.');
    console.log('📋 Remaining actions:');
    console.log('   1. Apply pending migrations via psql');
    console.log('   2. Re-deploy Edge Functions');
    console.log('   3. Verify Vercel rebuilds with new bundle');
    console.log('   4. Monitor logs to confirm 4xx/5xx errors disappear');
    process.exit(0);
  } else {
    console.log('\n❌ Some fixes are NOT in code. Please review.');
    process.exit(1);
  }
}

main();
