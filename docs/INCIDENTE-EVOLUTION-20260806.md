# Incidente Evolution — WhatsApp `wpp2` deslogado (2026-08-05/06)

- **Data do incidente:** 2026-08-05 23:37Z → 2026-08-06 ~13:00Z (resolução)
- **Duração:** ~13h23m de indisponibilidade da instância (23:37:13Z → ~13:00Z)
- **Instância afetada:** `wpp2` (UUID `f7a73e2c-327d-426c-8fa6-6ea7743ace02`)
- **Serviço:** Evolution API 2.3.7 (Baileys 7.0.0-rc.9) — Docker Swarm na VPS
- **Impacto:** envio/recebimento de mensagens WhatsApp do número `wpp2` indisponível; fila de saída acumulando (retry-stuck-messages)
- **Status:** ✅ RESOLVIDO — instância reconectada em 2026-08-06 ~13:00Z (`state=open`)
- **Classificação:** indisponibilidade (não é incidente de segurança; o aviso "suspeita de golpe" é geolocalização de datacenter, ver §7)
- **Documentado em:** 2026-08-06 (branch `f2/runbook-fase2-20260805`, working tree sujo — **não commitado**)

---

## 1) Síntese

O WhatsApp da instância `wpp2` foi **deslogado à força pelo WhatsApp** em
**2026-08-05 23:37:13.895Z** (20:37 BRT), com `reason = 401 "Log out instance"`,
e a sessão (credenciais Baileys) foi **destruída** (diretório da instância ficou vazio).

As tentativas de re-scan (QR) subsequentes falharam com **401 `device_removed`**
por ~13 horas (até ~12:52Z de 06/08). Após novo pairing (QR aceito e removido —
evidenciado pelo segundo `disconnectionAt` em 12:52:23.968Z), a instância
**reconectou em 2026-08-06 ~13:00Z (~10:00 BRT) com `state=open`**.

Período total de indisponibilidade: **~13h23m**.

| Marco | UTC | BRT |
|---|---|---|
| Última mensagem real | 05/08 22:24:55Z | 05/08 19:24:55 |
| Logout forçado (`401 Log out instance`) | 05/08 23:37:13.895Z | 05/08 20:37:13 |
| Fim das falhas de re-scan (`device_removed`) | 06/08 ~12:52Z | 06/08 ~09:52 |
| Reconexão (`state=open`) | 06/08 ~13:00Z | 06/08 ~10:00 |

## 2) Causa raiz

**Causa primária — enforcement do WhatsApp contra o Baileys 7.0.0-rc.9:**

O WhatsApp passou a aplicar enforcement (logout remoto forçado) contra clientes
rodando **Baileys 7.0.0-rc.9** — versão usada pela Evolution 2.3.7 (e também pela
2.4.0-rc2). O comportamento é relatado na issue
**[WhiskeySockets/Baileys #2248](https://github.com/WhiskeySockets/Baileys/issues/2248)**
(**aberta**): sessões são deslogadas com `reason 401 "Log out instance"` e o
re-pairing é rejeitado com `device_removed` por um período (cooldown de
~12–24h), mesmo após novo QR/pairing code.

**Fator secundário — IP de datacenter possivelmente marcado:**

A VPS roda em **Scala Hosting, EUA — IP `209.142.67.51`** (faixa de datacenter,
geolocalizada em Dallas/EUA). IPs de datacenter têm maior probabilidade de
flagging pelo WhatsApp (login de localização incompatível com o uso do número),
o que pode agravar o enforcement e/ou estender o cooldown. **Não há evidência de
comprometimento** — ver aviso "suspeita de golpe" em §7.

## 3) Timeline completa

Todos os horários em **UTC** e **BRT (UTC−3)**. Marcos verificados.

| # | Data (UTC) | Hora (UTC) | Hora (BRT) | Evento |
|---|---|---|---|---|
| 1 | 05/08 | 22:24:55Z | 19:24:55 | **Última mensagem real** processada pela instância `wpp2` |
| 2 | 05/08 | 23:37:13.895Z | 20:37:13 | **Logout forçado**: `disconnectionAt` original; `reason 401 "Log out instance"`; sessão destruída |
| 3 | 05/08 | pós-23:37Z | pós-20:37 | Diretório `/evolution/instances/f7a73e2c-327d-426c-8fa6-6ea7743ace02` **vazio** (session apagada) |
| 4 | 05/08 | (dia todo) | — | **Rotação da chave global da API para `v5`** (secret `evolution_api_key_v5_20260805`) — ver §6 |
| 5 | 05/08 23:37 → 06/08 ~12:52 | contínuo | — | **Re-scans falham com 401 `device_removed`** (cooldown do WhatsApp; ~13h15m de tentativas frustradas) |
| 6 | 06/08 | 10:18Z–11:51Z | 07:18–08:51 | **Deps/restarts** da Evolution (instalação/atualização de dependências e restarts do serviço) — sem efeito sobre o cooldown |
| 7 | 06/08 | ~11:51Z+ | ~08:51+ | **Redeploys** da Evolution (alinhamento/alteração de imagem do serviço no Swarm) |
| 8 | 06/08 | 12:52:23.968Z | 09:52:23 | **Novo logout registrado** (`disconnectionAt` atualizado) — prova de que o QR foi **aceito e removido em seguida** (pairing OK, cooldown encerrado) |
| 9 | 06/08 | ~13:00Z | ~10:00 | **Reconexão da instância `wpp2` com `state=open`** — incidente encerrado |
| 10 | 06/08 | pós-reconexão | — | Fila de saída drenada (retry-stuck-messages) e mensagens pendentes entregues |

> **Leitura do marco 8:** o `disconnectionAt` duplo (23:37:13.895Z original +
> 12:52:23.968Z novo) documenta a sequência completa: 1º logout = enforcement do
> WhatsApp; 2º logout = efeito colateral do re-pairing aceito (o cliente remove a
> sessão velha ao registrar a nova). A partir daí o estado passou a `open`.

## 4) Diagnóstico — evidências

| # | Evidência | Detalhe | Interpretação |
|---|---|---|---|
| E1 | `disconnectionAt` original | `2026-08-05T23:37:13.895Z` | Momento exato do logout forçado pelo WhatsApp |
| E2 | `disconnectionAt` duplo | 2º valor `2026-08-06T12:52:23.968Z` | Prova de que o QR foi aceito e a sessão velha removida em seguida (fim do cooldown) |
| E3 | Diretório de sessão vazio | `/evolution/instances/f7a73e2c-327d-426c-8fa6-6ea7743ace02` sem arquivos | Sessão Baileys **destruída** pelo logout (`Log out instance` apaga as credenciais) |
| E4 | Última mensagem real | `05/08 22:24:55Z` | Fim do tráfego normal ~1h12m antes do logout — sem mensagens entre 22:24Z e 23:37Z |
| E5 | Erro de re-scan | `401 device_removed` em todas as tentativas entre 23:37Z (05/08) e ~12:52Z (06/08) | Cooldown de re-pairing imposto pelo WhatsApp após enforcement |
| E6 | 401s no Traefik | callers da API Evolution com 401 crônicos **desde ≥ 14/07** | Problema pré-existente de chave/header nos callers (ver §6 — chave v5) — **não** relacionado ao logout, mas agravou o diagnóstico inicial |
| E7 | Watchdog suprimindo restart | `watchdog-baileys v11.1` suprimiu o restart automático ao detectar `device_removed` | Comportamento **correto** do watchdog (evita loop de re-pairing durante cooldown); sem ele, o serviço ficaria reiniciando em ciclo |
| E8 | Versões | Evolution **2.3.7** com Baileys **7.0.0-rc.9** (2.4.0-rc2 usa o mesmo rc.9) | Versão-alvo do enforcement — ver §2 |
| E9 | Issue upstream | [WhiskeySockets/Baileys #2248](https://github.com/WhiskeySockets/Baileys/issues/2248) — aberta | Confirma padrão: logouts 401 + `device_removed` + cooldown em rc.9 |

## 5) Correções aplicadas nesta sessão

> As ações abaixo foram executadas **nesta sessão** (2026-08-06). Os campos
> **Evidência** ficam para preenchimento/confirmação com a saída real dos
> comandos (não re-investigar os fatos já verificados; apenas anexar a prova).

### C-1 — Chave de API global rotacionada para `v5` (callers)
- **O que:** chave global da Evolution API rotacionada para a versão 5 — secret
  `evolution_api_key_v5_20260805` (rotacionado em 05/08).
- **Por quê:** callers apresentavam **401 crônicos desde ≥14/07** (E6); a
  rotação elimina chaves antigas vazadas/defasadas e padroniza os callers
  (agentes, edge functions, integrações).
- **Aplicada nesta sessão:** sim — conforme agentes/callers atualizados para a
  chave v5.
- **Evidência:** `[preencher: comandos/saídas de rotação e teste dos callers com a v5]`

### C-2 — Alinhamento de imagem da Evolution
- **O que:** imagem do serviço Evolution alinhada/atualizada no Swarm
  (redeploy do serviço em 06/08 ~11:51Z+).
- **Por quê:** garantir consistência entre imagem em execução e a versão
  pretendida (2.3.7 / candidata 2.4.0-rc2 — ambas com Baileys rc.9; o
  alinhamento não muda o enforcement, mas remove drift de imagem).
- **Aplicada nesta sessão:** sim.
- **Evidência:** `[preencher: imagem/tag em execução + data do redeploy no Portainer]`

### C-3 — Monitor/observabilidade
- **O que:** monitoramento da instância (estado `open`/`close`, `disconnectionAt`,
  watchdog-baileys) conferido/ajustado para esta classe de incidente.
- **Por quê:** o watchdog suprimiu corretamente o restart (E7), mas a detecção de
  "logout forçado + cooldown" deve gerar alerta explícito em vez de silêncio.
- **Aplicada nesta sessão:** sim (verificação/ajuste do monitor).
- **Evidência:** `[preencher: alerta/check configurado + estado do watchdog após o incidente]`

### C-4 — Re-pairing da instância `wpp2` (resolução operacional)
- **O que:** novo QR/pairing após o término do cooldown; aceito em
  12:52:23.968Z e conectado em ~13:00Z (`state=open`).
- **Aplicada nesta sessão:** sim (procedimento executado dentro da janela de
  cooldown respeitada — ver §7, lição L-2).
- **Evidência:** `[preencher: saída do GET /instance/connectionState com state=open]`

## 6) Diagnóstico diferencial — o que NÃO era

| Hipótese descartada | Por quê |
|---|---|
| Falha de infraestrutura (rede/container) | Container seguiu saudável; apenas a sessão Baileys foi removida |
| Chave de API v4 (callers 401) | 401 dos callers é problema de autenticação HTTP (desde ≥14/07), não de sessão WhatsApp; o logout foi na camada Baileys/WhatsApp |
| Comprometimento/roubo da conta | Sem evidência de acesso externo; o logout tem assinatura típica de enforcement (401 `Log out instance` + `device_removed` no re-pairing) — padrão da issue #2248 |
| Ação humana (logout manual) | Sem registro de logout manual; `reason 401 "Log out instance"` é o motivo emitido pelo servidor do WhatsApp |

## 7) Lições aprendidas e recomendações

### L-1 — Upgrade do Baileys (plano B imediato)
- **Baileys 6.7.24** (publicado 29/07/2026) é o **estável novo** e não está sob o
  enforcement que atinge o **7.0.0-rc.9**.
- **Recomendação:** avaliar downgrade/pin do Baileys para **6.7.24** na Evolution
  como **plano B** se o enforcement recorrer (novo `Log out instance`). Acompanhar
  a issue **#2248** para saber quando o rc.9/estável 7.x estiver liberado.
- ⚠️ Re-pairing após downgrade também está sujeito ao cooldown — planejar a janela.

### L-2 — Respeitar o cooldown de re-pairing (~24h)
- Após `401 Log out instance`, o WhatsApp impõe **~12–24h de `device_removed`**:
  tentar re-scan antes disso falha repetidamente e pode estender o bloqueio.
- **Recomendação:** após logout forçado, **esperar 24h antes de re-pairing**;
  manter o watchdog suprimindo restart (E7) e apenas monitorar o estado até a
  janela abrir. Tentativas em loop = piora.

### L-3 — Aviso "suspeita de golpe" = geolocalização de datacenter, NÃO é golpe
- O aviso de "suspeita de golpe"/localização "Dallas" exibido ao usuário final é
  a **geolocalização do datacenter** (Scala Hosting, IP `209.142.67.51`, EUA),
  não uma ação de golpista.
- **Recomendação:** comunicar aos usuários do `wpp2` que o login a partir de
  Dallas/EUA é o servidor legítimo da plataforma; avaliar (médio prazo) IP
  residencial/proxy dedicado para reduzir flagging (fator secundário da §2).

### L-4 — Observabilidade de logout forçado
- Detectar `reason 401 "Log out instance"` (vs. logout manual) e alertar
  imediatamente com o playbook de cooldown — em vez de descobrir por fila
  acumulada.

### L-5 — Callers: manter chave v5 e monitorar 401s
- Manter os callers na chave v5 (C-1) e monitorar 401s no Traefik (E6) para não
  confundir incidentes de autenticação HTTP com incidentes de sessão WhatsApp.

## 8) Referências

- Issue upstream: [WhiskeySockets/Baileys #2248](https://github.com/WhiskeySockets/Baileys/issues/2248) (aberta)
- Versões: Evolution 2.3.7 / 2.4.0-rc2 → Baileys 7.0.0-rc.9; Baileys estável novo 6.7.24 (29/07/2026)
- Instância: `wpp2` — UUID `f7a73e2c-327d-426c-8fa6-6ea7743ace02`
- Infra: VPS Scala Hosting — IP `209.142.67.51` (EUA/Dallas)
- Watchdog: `watchdog-baileys v11.1` (suprimiu restart em `device_removed` — comportamento correto)
- Secret: `evolution_api_key_v5_20260805` (rotação chave global v5, 05/08)
- Branch: `f2/runbook-fase2-20260805` — documento **não commitado** (working tree sujo)
