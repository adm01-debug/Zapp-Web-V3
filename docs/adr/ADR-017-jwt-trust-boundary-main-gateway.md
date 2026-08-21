# ADR-017 — Fronteira de confiança do JWT: `main` verifica, functions decodificam

**Status:** Aceito · **Data:** 2026-08-21 · **Origem:** etapa 8 do Bloco 0, `docs/PLANO-100-CONTRATOS-EDGE-20260821.md`

## Contexto

Algumas edge functions (ex.: `warroom-monthly-test/index.ts:31`) decodificam as
claims de um JWT `Bearer` **sem verificar a assinatura** — o comentário no
código diz "sem verificar assinatura — o gateway já o fez". A auditoria que
originou o PLANO-100 (2026-08-21) levantou isso como pendência a confirmar:
decodificar sem verificar é seguro **somente se** algo upstream já validou a
assinatura antes da function rodar.

## Decisão

A premissa está correta e é a arquitetura pretendida — documentando-a aqui:

- `supabase/functions/main/index.ts` é o **único entrypoint** roteado pelo
  runtime edge self-hosted (`supabase/edge-runtime`) para todas as functions.
- `main` verifica a assinatura do JWT via `jose.jwtVerify(token, secretKey)`
  (`main/index.ts:107-117`) usando `JWT_SECRET`/`JWT_SECRET_FILE`, com
  **fail-fast no boot** se `VERIFY_JWT=true` e nenhum segredo estiver
  resolvido (`main/index.ts:90-93`) — o container recusa subir em vez de
  aceitar requests contra uma chave indefinida.
- Esse gate roda para **toda function que não esteja em `PUBLIC_FNS`**
  (`main/index.ts:30-69`) — `warroom-monthly-test` não está nessa allowlist,
  logo toda chamada a ela já passou por `jwtVerify` com sucesso antes do
  worker da function ser sequer criado (`EdgeRuntime.userWorkers.create`).
  Confirmado por leitura direta do código em 2026-08-21 (nenhuma ocorrência
  de `warroom-monthly-test` em `PUBLIC_FNS`).
- Portanto, `decodeJwtClaims()` em `warroom-monthly-test` (e qualquer function
  não-pública que siga o mesmo padrão) pode **confiar** nas claims decodificadas
  sem revalidar a assinatura — reverificar seria trabalho redundante, não uma
  correção de segurança.

## Consequências

- **A premissa só vale enquanto `main` continuar sendo o único caminho de
  invocação.** Se o runtime edge algum dia permitir invocar uma function
  específica diretamente (bypassando `main`), qualquer function que só
  decodifica (sem verificar) passa a aceitar JWT forjado — isso quebraria
  esta fronteira de confiança silenciosamente.
- Novas functions que decodificam JWT sem verificar **devem**: (a) não estar
  em `PUBLIC_FNS`, e (b) documentar a dependência de `main` no cabeçalho do
  arquivo (padrão já seguido por `warroom-monthly-test`) — para que uma
  leitura futura não confunda "decodifica sem verificar" com "não verifica
  em lugar nenhum".
- Este ADR não altera código — é a confirmação por escrito pedida pela
  etapa 8 do Bloco 0.

## Referências

- `supabase/functions/main/index.ts` (gateway, allowlist `PUBLIC_FNS`, `verifyJWT`)
- `supabase/functions/warroom-monthly-test/index.ts` (consumidor do padrão)
- `docs/PLANO-100-CONTRATOS-EDGE-20260821.md` (Bloco 0, etapa 8)
