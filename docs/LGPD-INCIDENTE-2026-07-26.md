# Avaliação de Impacto — Incidente de Segurança LGPD
**Data do incidente:** 2026-07-26  
**Responsável:** DPO + TI  
**Classificação:** Incidente de Segurança com Potencial Violação de Dados Pessoais  
**Referência:** Art. 48 LGPD — Notificação à ANPD e titulares

---

## 1. Descrição do Incidente

O arquivo `.mcp.json` contendo o endpoint autenticado do MCP Supabase
(`https://supabase-mcp.atomicabr.com.br/s-{TOKEN}/mcp`) estava presente no
histórico do repositório Git enquanto o repositório era público no GitHub.

O token embutido no path da URL concede acesso irrestrito a: SQL arbitrário,
Storage, Auth (leitura de usuários), meta-dados do projeto.

## 2. Linha do Tempo

| Data | Evento |
|------|--------|
| ≈ 2026-06-17 | Repositório possivelmente criado/tornado público |
| ≈ 2026-06-17 | Primeiro commit contendo `.mcp.json` com token no path |
| 2026-07-26 | Detecção do risco durante auditoria de segurança |
| 2026-07-26 | Runbook de rotação criado (`infra/runbooks/SECURITY-INCIDENT-CREDENTIAL-ROTATION.md`) |
| 2026-07-26 | Issue criada para tornar repositório privado (#554) |
| **≤ 2026-07-26 +1h** | **Rotação de todas as credenciais (SLA)** |

**Período estimado de exposição:** confirmar via logs do nginx / Cloudflare Worker
(acesses ao path `/s-{TOKEN}/mcp`).

## 3. Dados Potencialmente Acessíveis

| Recurso | Dados | Titulares Afetados |
|---------|-------|-------------------|
| `auth.users` | e-mail, telefone, metadata de autenticação | Todos os usuários da plataforma |
| `zapp.profiles` | nome, empresa, avatar, preferências | 17 perfis internos |
| `zapp.contatos` | nome, CPF/CNPJ, telefone, e-mail | Até 51.688 contatos |
| `zapp.empresas` | razão social, CNPJ, endereço | Até 51.688 empresas |
| `evo.evolution_messages` | conteúdo de mensagens WhatsApp | Todos os contatos com histórico |
| `evo.evolution_contacts` | JID WhatsApp, nome, foto | 20.563 contatos |
| Storage buckets | Mídias, comprovantes, recibos | Conforme bucket |

## 4. Avaliação de Risco

| Fator | Avaliação |
|-------|-----------|
| Probabilidade de exploração | Média — URL estava em histórico Git, não em texto plano visível imediatamente |
| Impacto potencial | Alto — acesso a dados pessoais sensíveis (mensagens, contatos, CPF/CNPJ) |
| Evidência de exploração | **A confirmar** via logs de acesso |
| Base legal afetada | Art. 7 LGPD (tratamento lícito) + Art. 46 (segurança) |

## 5. Medidas Imediatas Tomadas

- [x] Detecção e documentação do incidente
- [x] Runbook de rotação criado com SLA ≤ 1h
- [x] `.mcp.json` adicionado ao `.gitignore` (já estava)
- [x] Issue #554 criada para privatizar o repositório
- [ ] Token MCP Supabase rotacionado ← **ação urgente TI**
- [ ] service_role key rotacionada ← **ação urgente TI**
- [ ] anon key rotacionada ← **ação urgente TI**
- [ ] Repositório tornado PRIVADO ← **ação urgente TI**
- [ ] Logs de acesso auditados (nginx/Cloudflare) ← **DPO**

## 6. Obrigações LGPD (Art. 48)

### Notificação à ANPD

**Prazo:** 72 horas após ciência do incidente (2026-07-29 até 23h59)

**Obrigatória se:**
- Logs confirmarem acessos externos ao endpoint
- Dados de titulares forem confirmadamente expostos
- O incidente envolver dados sensíveis (mensagens de saúde, financeiros)

**Canal:** Portal da ANPD — https://www.gov.br/anpd/pt-br/canais-de-atendimento

### Notificação aos Titulares

Avaliar após análise dos logs. Se confirmada exploração:
- Comunicar titulares afetados com linguagem acessível
- Informar que tipo de dado pode ter sido acessado
- Orientar sobre medidas de proteção (troca de senha, etc.)

## 7. Evidências a Preservar

```bash
# Logs nginx/Cloudflare — buscar acessos ao path do token
grep "s-{TOKEN}" /var/log/nginx/access.log
# Cloudflare: Dashboard → Analytics → Log Explorer → filtrar path

# Commits com o token no histórico
git log --all --oneline -- .mcp.json
git log --all -p -- .mcp.json | grep "s-"
```

## 8. Medidas Preventivas Implementadas

- gitleaks scan em PRs e push (`.github/workflows/gitleaks.yml`)
- GitHub Secret Scanning + Push Protection ativados
- `.mcp.json` e variantes no `.gitignore`
- Repositório será privatizado (#554)

## 9. Registro de Ações

| Ação | Responsável | Data | Status |
|------|-------------|------|--------|
| Detectar período exato de exposição | TI | 2026-07-26 | ⏳ |
| Rotar token MCP | TI | 2026-07-26 | ⏳ |
| Rotar service_role + anon key | TI | 2026-07-26 | ⏳ |
| Privatizar repositório | TI | 2026-07-26 | ⏳ |
| Auditar logs de acesso | DPO | 2026-07-27 | ⏳ |
| Decidir notificação ANPD | DPO | 2026-07-29 | ⏳ |
| Decidir notificação titulares | DPO | 2026-07-29 | ⏳ |
| Relatório final de incidente | DPO + TI | 2026-08-05 | ⏳ |

---

*Documento gerado em 2026-07-26. Manter em confidencialidade — não versionar após preenchimento dos dados de titulares.*
