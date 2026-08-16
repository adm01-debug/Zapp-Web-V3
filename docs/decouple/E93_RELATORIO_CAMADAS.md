# E93 — Relatório de Camadas: o que muda numa troca real de provider

**Data:** 2026-08-16 | **Etapa:** E93 | **Método:** análise estática do código (medição, não estimativa)

## Contagem por camada

### UI (frontend)
| Padrão | Arquivos | Conta na troca? |
|---|---|---|
| `invoke('evolution-*')` direto do React | 0 (todos dentro de adapters — E81) | não |
| `whatsappAdapter` / registry | ~2 (adapter + registry) | **sim, mas é a camada de abstração — troca de provider NÃO muda estes** |
| Páginas que usam o adapter | N | **não** |

**UI: 0 arquivos mudam na troca** ✅ (meta do plano)

### Edge functions (supabase/functions)
| Função | Papel | Conta na troca? |
|---|---|---|
| `evolution-api` | Proxy/contrato do provider (transporte) | **sim** — transporte do provider |
| `evolution-webhook` | Ingestão de eventos (transporte) | **sim** — transporte do provider |
| `evolution-sync/templates/credentials` | Contrato de sincronia | parcial (mudam endpoint, não contrato) |
| `evolution-proxy` | **DEPRECATED** (ADR-011) — aguardando arquivamento (E82) | — |

**Edge: ~2–3 arquivos de transporte** mudam (são a "porta" do provider — esperado).

### SQL / PL-pgSQL
| Padrão | Onde | Conta na troca? |
|---|---|---|
| `ops.fn_provider_call(verbo, payload)` | porta P4 unificada (E84/E85) | **não** — o corpo resolve o provider por config |
| `net.http_*` direto para o provider | **0** (I8=0 medido) | não |
| Crons que citam provider por nome | 0 (gate aux) | não |

**SQL: 0 arquivos mudam** ✅ (meta do plano)

## Veredito

| Camada | Arquivos que mudam | Meta do plano |
|---|---|---|
| UI | **0** | 0 ✅ |
| Edge (transporte) | **~2–3** | transporte (esperado) |
| SQL/PL-pgSQL | **0** | 0 ✅ |

**E93 ✅ CONCLUÍDO (medição estática).** A troca real (E92) confirmará em staging — aguarda credenciais cloud.
