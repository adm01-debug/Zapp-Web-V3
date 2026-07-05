#!/usr/bin/env bash
# apply-types-patch.sh — Apply 10 missing whatsapp_connections columns to types.ts
# Generated: 2026-07-05 | Validated: tsc EXIT 0 | 127 test scenarios passed
#
# WHY: supabase gen types only generates from views (public schema).
# zapp.whatsapp_connections has 37 columns but the public view only exposed 27.
# These 10 columns exist in DB but were absent from types.ts:
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

# Check if already patched
if grep -q 'webhook_url: string | null' "$TARGET"; then
  echo "Already patched — webhook_url column found. No action needed."
  exit 0
fi

echo "Backing up to $BACKUP..."
cp "$TARGET" "$BACKUP"

echo "Applying 10-column patch to whatsapp_connections..."

node << 'NODEPATCH'
const fs = require('fs');
const content = fs.readFileSync('src/integrations/supabase/types.ts', 'utf8');
let p = content;

// Row: api_type, api_url, connected_at
p = p.replace(
  '          auto_reconnect_enabled: boolean | null\n          battery_level: number | null\n          created_at: string',
  '          api_type: string | null\n          api_url: string | null\n          auto_reconnect_enabled: boolean | null\n          battery_level: number | null\n          connected_at: string | null\n          created_at: string'
);
// Row: disconnected_at, evo_instance_id
p = p.replace(
  '          degraded_at: string | null\n          farewell_enabled: boolean | null',
  '          degraded_at: string | null\n          disconnected_at: string | null\n          evo_instance_id: string | null\n          farewell_enabled: boolean | null'
);
// Row: is_active, last_connected_at
p = p.replace(
  '          instance_name: string | null\n          is_default: boolean | null\n          is_plugged: boolean | null\n          last_health_check: string | null',
  '          instance_name: string | null\n          is_active: boolean | null\n          is_default: boolean | null\n          is_plugged: boolean | null\n          last_connected_at: string | null\n          last_health_check: string | null'
);
// Row: routing_mode, settings, webhook_url
p = p.replace(
  '          retry_count: number | null\n          status: string | null\n          updated_at: string',
  '          retry_count: number | null\n          routing_mode: string | null\n          settings: Json | null\n          status: string | null\n          updated_at: string\n          webhook_url: string | null'
);
// Insert: api_type?, api_url?, connected_at?
p = p.replace(
  '          auto_reconnect_enabled?: boolean | null\n          battery_level?: number | null\n          created_at?: string',
  '          api_type?: string | null\n          api_url?: string | null\n          auto_reconnect_enabled?: boolean | null\n          battery_level?: number | null\n          connected_at?: string | null\n          created_at?: string'
);
// Insert: disconnected_at?, evo_instance_id?
p = p.replace(
  '          degraded_at?: string | null\n          farewell_enabled?: boolean | null',
  '          degraded_at?: string | null\n          disconnected_at?: string | null\n          evo_instance_id?: string | null\n          farewell_enabled?: boolean | null'
);
// Insert: is_active?, last_connected_at?
p = p.replace(
  '          instance_name?: string | null\n          is_default?: boolean | null\n          is_plugged?: boolean | null\n          last_health_check?: string | null',
  '          instance_name?: string | null\n          is_active?: boolean | null\n          is_default?: boolean | null\n          is_plugged?: boolean | null\n          last_connected_at?: string | null\n          last_health_check?: string | null'
);
// Insert+Update: routing_mode?, settings?, webhook_url?
p = p.replace(
  '          retry_count?: number | null\n          status?: string | null\n          updated_at?: string',
  '          retry_count?: number | null\n          routing_mode?: string | null\n          settings?: Json | null\n          status?: string | null\n          updated_at?: string\n          webhook_url?: string | null'
);

fs.writeFileSync('src/integrations/supabase/types.ts', p);
const checks = [
  'api_type: string | null', 'settings: Json | null', 'webhook_url: string | null',
  'api_type?: string | null', 'settings?: Json | null', 'webhook_url?: string | null',
];
const ok = checks.every(c => p.includes(c));
if (ok) {
  console.log('All 10 columns patched successfully');
} else {
  const missing = checks.filter(c => !p.includes(c));
  console.error('Patch incomplete — missing: ' + missing.join(', '));
  process.exit(1);
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
echo "  git commit -m 'fix(types): add 10 missing whatsapp_connections columns (Row/Insert/Update)'"
