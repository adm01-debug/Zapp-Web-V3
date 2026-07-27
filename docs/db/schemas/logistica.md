# Schema `logistica` — Módulo Logística

**Dono:** time de logística  
**Atualizado:** 27/07/2026

## Propósito

Módulo de gestão logística: remessas, etiquetas, rastreamento.

## Estatísticas

| Objeto | Quantidade |
|---|---:|
| Tabelas | 3 |
| Triggers | 2 |

## Tabelas Principais

- `remessas` — remessas de produtos
- `etiquetas` — etiquetas de envio
- `rastreamentos` — rastreamentos de entrega

## Storage Bucket

| Bucket | Visibilidade |
|---|---|
| `etiquetas-remessa` | privado |

## Dependências

- **Consumido por:** `public` (3 views)
