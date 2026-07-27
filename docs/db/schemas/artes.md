# Schema `artes` — Módulo Artes / Design

**Dono:** time de marketing/design  
**Atualizado:** 27/07/2026

## Propósito

Módulo de gestão de artes/materiais de design: memes de áudio, stickers, assets de marketing.

## Estatísticas

| Objeto | Quantidade |
|---|---:|
| Tabelas | 2 |
| Views | 1 |
| Funções | 15 |
| Triggers | 1 |

## Tabelas Principais

- `audio_memes` — memes de áudio (Realtime publicada em `20260724000005`)
- `design_assets` — assets de design

## Storage Buckets

| Bucket | Visibilidade |
|---|---|
| `audio-memes` | público (sem PII) |
| `stickers` | público |
| `custom-emojis` | público |

## Dependências

- Consumido pelo app via `zapp` schema
