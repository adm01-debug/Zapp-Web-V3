#!/bin/bash
# add-schema-stubs.sh
# Adiciona stubs minimos para schemas zapp e evo no types.ts
# Necessario para o CI gate check-types-schemas.mjs passar
# Stubs serao substituidos pelo conteudo completo quando gen-types-zapp.yml for executado

set -e

TYPES_FILE="src/integrations/supabase/types.ts"

if [ ! -f "$TYPES_FILE" ]; then
  echo "ERROR: $TYPES_FILE not found"
  exit 1
fi

# Verificar se ja tem zapp e evo
HAS_ZAPP=$(grep -c '^  zapp: {' "$TYPES_FILE" || true)
HAS_EVO=$(grep -c '^  evo: {' "$TYPES_FILE" || true)

if [ "$HAS_ZAPP" -gt 0 ] && [ "$HAS_EVO" -gt 0 ]; then
  echo "types.ts already has zapp and evo schemas — no changes needed"
  exit 0
fi

echo "Adding zapp and evo stubs to $TYPES_FILE..."

python3 << 'PYEOF'
import sys

with open('src/integrations/supabase/types.ts', 'r', encoding='utf-8') as f:
    content = f.read()

has_zapp = '  zapp: {' in content
has_evo = '  evo: {' in content

if has_zapp and has_evo:
    print('Already has zapp and evo — skipping')
    sys.exit(0)

stubs_parts = []
if not has_zapp:
    stubs_parts.append('''  zapp: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }''')

if not has_evo:
    stubs_parts.append('''  evo: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }''')

stubs = '\n'.join(stubs_parts)

closing = '\n} as const\n'
idx = content.rfind(closing)
if idx == -1:
    print('ERROR: closing pattern not found in types.ts', file=sys.stderr)
    sys.exit(1)

new_content = content[:idx+1] + stubs + '\n' + content[idx+1:]

with open('src/integrations/supabase/types.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f'OK — added stubs: zapp={not has_zapp}, evo={not has_evo}')
print(f'New size: {len(new_content)} bytes')
PYEOF

echo "Done."
