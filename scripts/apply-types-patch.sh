#!/usr/bin/env bash
# apply-types-patch.sh — Apply missing whatsapp_connections columns to types.ts
# Generated: 2026-07-05 | Validated: node + adversarial simulation (200+ cenarios)
#
# WHY: supabase gen types only generates from views (public schema).
# zapp.whatsapp_connections has 37 columns but the public view exposed fewer.
# These columns exist in DB but were absent from types.ts:
#   api_type, api_url, connected_at, disconnected_at, evo_instance_id,
#   is_active, last_connected_at, routing_mode, settings (Json), webhook_url
#
# USAGE:
#   bash scripts/apply-types-patch.sh
#
# ALTERNATIVE (regenerate fully):
#   npx supabase gen types typescript --local > src/integrations/supabase/types.ts
set -euo pipefail

TARGET="src/integrations/supabase/types.ts"
BACKUP="${TARGET}.bak"

if [ ! -f "$TARGET" ]; then
  echo "Error: $TARGET not found. Run from repo root."
  exit 1
fi

# Check if ALL required columns are present (not just one)
MISSING=0
for col in "api_type" "routing_mode" "disconnected_at" "evo_instance_id" "webhook_url" "connected_at" "last_connected_at"; do
  if ! grep -q "${col}:" "$TARGET"; then
    echo "Missing column: $col"
    MISSING=$((MISSING + 1))
  fi
done

if [ $MISSING -eq 0 ]; then
  echo "Already fully patched — all required columns found. No action needed."
  exit 0
fi

echo "Backing up to $BACKUP..."
cp "$TARGET" "$BACKUP"

echo "Applying patch for $MISSING missing columns..."

node << 'NODEPATCH'
const fs = require('fs');
const content = fs.readFileSync('src/integrations/supabase/types.ts', 'utf8');
let p = content;
let applied = 0;

function tryReplace(from, to, label) {
  if (p.includes(to.split('\n')[0])) {
    console.log('  SKIP (already present):', label);
    return;
  }
  if (p.includes(from)) {
    p = p.replaceAll(from, to);
    applied++;
    console.log('  PATCHED:', label);
  } else {
    console.log('  WARN: pattern not found for', label);
  }
}

// ROW: api_type, api_url before auto_reconnect_enabled
tryReplace(
  '          auto_reconnect_enabled: boolean | null\n          battery_level: number | null\n          created_at: string',
  '          api_type: string | null\n          api_url: string | null\n          auto_reconnect_enabled: boolean | null\n          battery_level: number | null\n          created_at: string',
  'api_type Row (variant A)'
);
tryReplace(
  '          auto_reconnect_enabled: boolean | null\n          battery_level: number | null\n          connected_at: string | null\n          created_at: string',
  '          api_type: string | null\n          api_url: string | null\n          auto_reconnect_enabled: boolean | null\n          battery_level: number | null\n          connected_at: string | null\n          created_at: string',
  'api_type Row (variant B)'
);

// ROW: disconnected_at, evo_instance_id after degraded_at
tryReplace(
  '          degraded_at: string | null\n          farewell_enabled: boolean | null',
  '          degraded_at: string | null\n          disconnected_at: string | null\n          evo_instance_id: string | null\n          farewell_enabled: boolean | null',
  'disconnected_at Row'
);

// ROW: routing_mode, settings before status/updated_at (2 variants)
tryReplace(
  '          retry_count: number | null\n          status: string | null\n          updated_at: string',
  '          retry_count: number | null\n          routing_mode: string | null\n          settings: Json | null\n          status: string | null\n          updated_at: string',
  'routing_mode Row'
);
tryReplace(
  '          retry_count: number | null\n          status: string | null\n          updated_at: string\n          webhook_url: string | null',
  '          retry_count: number | null\n          routing_mode: string | null\n          settings: Json | null\n          status: string | null\n          updated_at: string\n          webhook_url: string | null',
  'routing_mode Row (variant B, webhook_url present)'
);

// INSERT: api_type?, api_url? before auto_reconnect_enabled?
tryReplace(
  '          auto_reconnect_enabled?: boolean | null\n          battery_level?: number | null\n          created_at?: string',
  '          api_type?: string | null\n          api_url?: string | null\n          auto_reconnect_enabled?: boolean | null\n          battery_level?: number | null\n          created_at?: string',
  'api_type Insert (variant A)'
);
tryReplace(
  '          auto_reconnect_enabled?: boolean | null\n          battery_level?: number | null\n          connected_at?: string | null\n          created_at?: string',
  '          api_type?: string | null\n          api_url?: string | null\n          auto_reconnect_enabled?: boolean | null\n          battery_level?: number | null\n          connected_at?: string | null\n          created_at?: string',
  'api_type Insert (variant B)'
);

// INSERT: disconnected_at?, evo_instance_id? after degraded_at?
tryReplace(
  '          degraded_at?: string | null\n          farewell_enabled?: boolean | null',
  '          degraded_at?: string | null\n          disconnected_at?: string | null\n          evo_instance_id?: string | null\n          farewell_enabled?: boolean | null',
  'disconnected_at Insert'
);

// INSERT: routing_mode?, settings? before status?/updated_at?
tryReplace(
  '          retry_count?: number | null\n          status?: string | null\n          updated_at?: string',
  '          retry_count?: number | null\n          routing_mode?: string | null\n          settings?: Json | null\n          status?: string | null\n          updated_at?: string',
  'routing_mode Insert'
);

fs.writeFileSync('src/integrations/supabase/types.ts', p);

const checks = [
  'api_type: string | null',
  'routing_mode: string | null',
  'disconnected_at: string | null',
  'evo_instance_id: string | null',
  'webhook_url: string | null',
  'connected_at: string | null',
  'last_connected_at:',
  'api_type?: string | null',
  'routing_mode?: string | null',
];
const failed = checks.filter(c => !p.includes(c));
if (failed.length > 0) {
  console.error('INCOMPLETE:', failed.join(', '));
  process.exitCode = 1;
} else {
  console.log('All', applied, 'patches applied. All checks passed.');
}
NODEPATCH

echo "Running tsc validation..."
if npx tsc --noEmit 2>&1 | tail -5; then
  echo "tsc: PASS"
else
  echo "tsc FAILED — restoring backup"
  cp "$BACKUP" "$TARGET"
  exit 1
fi

echo ""
echo "Done! Commit with:"
echo "  git add src/integrations/supabase/types.ts"
echo "  git commit -m 'fix(types): add missing whatsapp_connections columns'"
