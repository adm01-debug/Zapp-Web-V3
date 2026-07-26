# ADR-003: Repositório Privado — Decisão de Segurança

**Status:** PROPOSTA
**Data:** 2026-07-26
**Decisor:** Engineering Team

---

## Contexto

Em 2026-07-26, foi identificado que o repositório `adm01-debug/zapp-web-v3` estava **PÚBLICO**, contendo:
- 944 migrations de banco de dados (incluindo estrutura de tabelas)
- 129 Edge Functions com lógicas de negócio proprietárias
- Integração com Supabase (banco de dados de clientes)
- Integração com Evolution API (WhatsApp Business)
- Integração com sistemas de pagamento
- Workflows de CI/CD com credenciais

Adicionalmente, um token de Service Role do Supabase foi **involuntariamente exposto** no arquivo `.mcp.json` versionado.

## Decisão

**O repositório deve ser tornar PRIVADO.**

### Justificativa

1. **Dados de Clientes**: O sistema gerencia conversas de WhatsApp Business de clientes reais. Dados de contato, mensagens e mídias são dados pessoais sob LGPD.

2. **Segredos de Infraestrutura**: A natureza do projeto (WhatsApp Business, Supabase self-hosted, Evolution API, integrações bancárias) significa que credenciais de infraestrutura são necessárias para desenvolvimento.

3. **Propriedade Intelectual**: As 129 Edge Functions e a arquitetura proprietária do sistema representam ativos de propriedade intelectual.

4. **Compliance**: Ambientes de produção de WhatsApp Business, sistemas financeiros e dados de saúde (LGPD) exigem controles de acesso rigorosos.

5. **Histórico de Incidentes**: A exposição do token em 2026-07-14 demonstra que o repositório público facilita a exposição inadvertida de credenciais.

### Alternativas Consideradas

| Alternativa | Problema |
|-------------|----------|
| Manter público + Secret Scanning | Não impede exposição, apenas detecta após o fato |
| Manter público + Push Protection | Protege pushes futuros, mas histórico já exposto |
| Fork privado por desenvolvedor | Fragmentação de código, dificuldade de sincronização |

## Consequências

### Positivas
- Controle de acesso granular por colaborador
- Proteção contra exposição inadvertida de credenciais
- Compliance com regulamentações de dados
- Segurança para propriedade intelectual

### Negativas
- Desenvolvedores externos não podem fazer fork direto
- Aumenta fricção para contribuidores ocasionais
- Requer gestão de convites para novos membros

## Ação

Executar via GitHub CLI ou painel:
```bash
gh repo edit --visibility private
```

**Responsável:** DevOps / Security
**Prazo:** Imediato
**Validação:** `gh repo view --json visibility` deve retornar "PRIVATE"

---

*Esta ADR complementa a ADR-002 (bucket público) e a ADR-001 (arquitetura de storage).*
