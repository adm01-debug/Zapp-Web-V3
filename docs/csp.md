# Content Security Policy — CANÔNICA (fonte única de verdade)

> **Última atualização:** 2026-08-06 (CSP v11)
> **Arquivos sincronizados:** `vercel.json` (Vercel, deploy principal), `nginx.conf` (nginx Docker, imagem de produção) e `nginx-prod.conf` (nginx VPS fallback)
> **Regra de ouro:** QUALQUER mudança de CSP deve ser feita AQUI primeiro e copiada para os TRÊS arquivos. Nunca editar só um.

## Política canônica (v11)

```
default-src 'self';
manifest-src 'self' data: https://vercel.com;
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https://supabase.atomicabr.com.br https://allrjhkpuscmgbsnmjlv.supabase.co https://zapp-media-proxy.adm01.workers.dev https://*.googleusercontent.com https://lh3.googleusercontent.com https://*.whatsapp.net https://*.cdn.whatsapp.net https://pps.whatsapp.net https://imagedelivery.net https://*.fbcdn.net https://*.fbsbx.com https://img.youtube.com https://i.ytimg.com https://www.youtube.com;
media-src 'self' data: blob: https://supabase.atomicabr.com.br https://zapp-media-proxy.adm01.workers.dev https://mmg.whatsapp.net https://*.whatsapp.net;
font-src 'self' data: https://fonts.gstatic.com;
connect-src 'self' https://supabase.atomicabr.com.br wss://supabase.atomicabr.com.br https://evolution.atomicabr.com.br https://n8n.atomicabr.com.br https://*.atomicabr.com.br wss://*.atomicabr.com.br wss: https://api.openai.com https://generativelanguage.googleapis.com https://api.pwnedpasswords.com https://api.mapbox.com https://zapp-media-proxy.adm01.workers.dev https://*.ingest.sentry.io https://*.sentry.io https://fonts.googleapis.com https://fonts.gstatic.com;
worker-src 'self' blob:;
frame-src 'self' https://*.atomicabr.com.br;
object-src 'none';
frame-ancestors 'self';
base-uri 'self';
form-action 'self';
```

## Por que cada diretiva existe

| Diretiva | Origem | Motivo |
|---|---|---|
| `default-src 'self'` | os 3 | Baseline: nada de terceiros por padrão |
| `manifest-src 'self' data: https://vercel.com` | vercel.json | PWA manifest inline como data URI no index.html (bypass de CORS da SSO Vercel em previews) |
| `script-src 'self' 'unsafe-inline' 'unsafe-eval'` | vercel.json + nginx | `'unsafe-inline'` é **obrigatório**: `index.html` tem 2 scripts inline de boot (recoverPreview/service-worker purge e root-loader). `'unsafe-eval'` mantido por compatibilidade com bundles atuais (ver "Relaxamentos conhecidos") |
| `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` | vercel.json | TailwindCSS usa estilos inline; Google Fonts via CSS import |
| `img-src ...` | os 3 (união) | Supabase self-hosted + projeto Lovable legado (band-aid, ver abaixo) + proxy de mídia + WhatsApp (mmg/cdn/pps) + Google user content + Facebook CDN + YouTube thumbnails + Cloudflare Images |
| `media-src 'self' data: blob: ...` | os 3 | Vídeos/áudios do WhatsApp chegam como data URL base64 (`data:` obrigatório) e blob: |
| `font-src 'self' data: https://fonts.gstatic.com` | os 3 | Fontes |
| `connect-src ...` | os 3 | Supabase (https+wss), Evolution API, n8n, api.openai.com, Gemini, proxy de mídia, Sentry, Google Fonts + **v11 (2026-08-06):** `wss:` (WebSocket SIP configurável em `useSipConnection` — VoIP), `https://api.pwnedpasswords.com` (breach-check de senha no fluxo de auth, `PasswordStrengthMeter`), `https://api.mapbox.com` (geocoding + tiles de localização, `useLocationPicker`) |
| `worker-src 'self' blob:` | vercel.json | Service Worker (`/sw.js`) + workers via blob: |
| `frame-src 'self' https://*.atomicabr.com.br` | nginx | Embeds/iframes dos próprios domínios atomicabr |
| `object-src 'none'` | nginx | Bloqueia plugins legados (object/embed) |
| `frame-ancestors 'self'` | os 3 | Anti-clickjacking (junto com X-Frame-Options SAMEORIGIN) |
| `base-uri 'self'` / `form-action 'self'` | os 3 | Hardening de base tag e forms |

> **Nota v11:** `wss:` (esquema nu) é um relaxamento deliberado — o servidor SIP é configurável pelo usuário (`VoIPPanel`, default Bitrix). Futuro: restringir por allowlist por tenant/org. O `connect-src` dos 3 arquivos deve permanecer **idêntico** (validado por script, abaixo).

## BAND-AID TEMPORÁRIO (NÃO remover antes da migração)

`https://allrjhkpuscmgbsnmjlv.supabase.co` (img-src) é o projeto Supabase Lovable antigo
(pré-migração self-hosted). 1066 contatos ainda referenciam avatares nesse storage
(~1370 objetos no bucket avatars). O domínio é gerenciado pelo Supabase (confiável),
mas deve ser removido assim que os avatares forem migrados para
`supabase.atomicabr.com.br` (storage migration pendente). Remover antes = avatares quebrados.

## Relaxamentos conhecidos (dívida de segurança)

- **`script-src 'unsafe-inline'`** — necessário para os 2 scripts inline de boot do `index.html`
  (purge de service worker legado + root-loader). Caminho de hardening futuro:
  1. Mover os scripts para `public/static/*.js`;
  2. Computar SHA-256 hashes (`openssl dgst -sha256 -binary <file> | base64`);
  3. Trocar `'unsafe-inline'` por `'sha256-...'` nos dois arquivos (hashes mudam a cada edição do script).
- **`script-src 'unsafe-eval'`** — mantido para não quebrar bundles atuais em produção.
  Tentar remover em ambiente de staging antes.
- **`connect-src wss:` (esquema nu)** — exigido pelo VoIP SIP com servidor configurável;
  ideal futuro: allowlist por tenant (ver nota v11).
- **`frame-ancestors 'self'`** — se algum embed externo for necessário, adicionar o domínio
  EXPLÍCITO aqui e em `X-Frame-Options` (que não aceita lista — remover o header se preciso).

## Nonces: NÃO usar (decisão 2026-08-04)

`src/lib/cspNonce.ts` (buildCSPHeader/getCSPNonce/generateCSPNonce/applyNonceToScript/withCSPNonce)
foi **removido** — era código morto (0 imports em src) e dava falsa sensação de proteção:
os headers reais não usam nonce, e nonce é incompatível com `'unsafe-inline'` (browsers
ignoram nonce quando unsafe-inline está presente). Enquanto os scripts de boot forem
inline, o caminho é hash (ver acima), não nonce.

## Como sincronizar (verificação)

Após qualquer mudança, conferir que os 3 arquivos têm a MESMA política:

```bash
# Extrai o CSP de cada arquivo e compara (normaliza whitespace)
python - <<'EOF'
import json, re, difflib
def norm(s): return ' '.join(s.split())
v = json.load(open('vercel.json'))
csp_v = norm(next(h['value'] for h in v['headers'][0]['headers'] if h['key'] == 'Content-Security-Policy'))
def csp_from_nginx(path):
    n = open(path).read()
    return norm(re.search(r'add_header Content-Security-Policy "([^"]+)"', n).group(1))
csp_n = csp_from_nginx('nginx.conf')
csp_np = csp_from_nginx('nginx-prod.conf')
print('vercel.json == nginx.conf:', csp_v == csp_n)
print('nginx.conf == nginx-prod.conf:', csp_n == csp_np)
if csp_v != csp_n or csp_n != csp_np:
    print('\n'.join(difflib.unified_diff(csp_n.split(';'), csp_v.split(';'), 'nginx', 'vercel')))
EOF
```

Validação JSON: `python -m json.tool vercel.json > /dev/null && echo OK`
Validação nginx (onde houver binário): `nginx -t`
