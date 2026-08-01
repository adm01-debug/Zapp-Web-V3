# ADR-005 — Chave de Unicidade de Contatos (`evo.evolution_contacts`)

- **Status:** PROPOSTO — **decisão pendente**
- **Data:** 2026-08-01
- **Contexto:** auditoria de unicidade pós-migração Supabase self-hosted (`supabase.atomicabr.com.br`)
- **Repositório:** adm01-debug/zapp-web-v3 (worktree `C:/c/tmp/wt-audit`)

---

## 1. Contexto

- `evo.evolution_contacts` (base da view facade `zapp.contacts`) contém **1532 linhas afetadas por duplicidade de `phone_number`**, organizadas em **504 grupos duplicados**.
- **UNIQUEs atuais:** apenas `(id)` e `(remote_jid)`. **Não existe** UNIQUE sobre `phone_number`.
- O mesmo contato pode ser sincronizado por **mais de uma instância WhatsApp** (modelo multi-instância do Evolution).

---

## 2. Hipótese

As duplicatas de `phone_number` são **multi-instância legítimas**: o mesmo cliente/número aparece em **instâncias diferentes** (ex.: instância por loja/filial/operador), cada uma com seu próprio registro em `evolution_contacts`. Nesse caso, a duplicidade não é lixo de dados — é o modelo de negócio funcionando.

---

## 3. Opções consideradas

### Opção A — `UNIQUE(phone_number, instance_name)`
- Permite o mesmo número em **instâncias distintas**; impede duplicidade **dentro da mesma instância**.
- **Alinhada com a hipótese** multi-instância legítima.
- Custo: índice composto novo; comportamento atual preservado.

### Opção B — `UNIQUE(phone_number)` global
- Um número só pode existir **uma única vez** no sistema.
- Exige **dedupe/merge prévio** dos 504 grupos (1532 linhas) e **quebra o modelo multi-instância** (mesmo cliente em instâncias diferentes passaria a colidir).
- Custo: alto impacto operacional (merge de linhas, reescrita de referências/FKs).

---

## 4. Decisão

**PENDENTE** — requer a **classificação da etapa 28** (classificação das duplicatas) antes de decidir:

- Se a maioria dos 504 grupos for **multi-instância legítima** → **Opção A**.
- Se houver duplicatas **reais** (mesma instância, dados redundantes/inconsistentes) → limpeza prévia + avaliar **Opção B** (ou A + dedupe pontual dos casos reais).

Nenhuma das opções deve ser executada **sem** a classificação da etapa 28.

---

## 5. Consequências

- **Opção A:** escrita via `zapp.contacts` (INSTEAD OF triggers) e sync do Evolution permanecem como estão; adicionar índice UNIQUE composto.
- **Opção B:** dedupe de 1532 linhas / 504 grupos, reescrita de referências e mudança de contrato do modelo multi-instância.
- **Qualquer opção:** migration com **validação de duplicatas antes do `CREATE UNIQUE INDEX`** — nunca criar UNIQUE com duplicatas existentes (a migration falharia).

---

## 6. Próximos passos

1. Aguardar/executar a **classificação da etapa 28** (classificar os 504 grupos em "multi-instância legítima" vs "duplicata real").
2. Decidir **A vs B** com base na classificação.
3. Migration: dedupe (se B) + `CREATE UNIQUE INDEX` correspondente.

---

## 7. Referências

- `zapp-facade-layer.md` (view `zapp.contacts` → `evo.evolution_contacts`)
- Auditoria de unicidade/duplicatas (etapa 28) — classificação pendente
