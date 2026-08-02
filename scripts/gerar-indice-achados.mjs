#!/usr/bin/env node
// ============================================================================
// GERADOR DO ÍNDICE DE ACHADOS
// ============================================================================
// Lê `PLANO_IMPLEMENTACAO_100.md` (200 achados) e `PLANO_CORRECAO_20_ETAPAS.md`
// (20 etapas) e produz `docs/audits/INDICE_ACHADOS.md`: uma tabela única com
// achado -> severidade -> etapa -> dependências -> rollback -> completude.
//
// Motivo: o plano tem 222 KB. Sem índice, o agente de correção não consegue
// responder perguntas básicas — "quais achados são desta etapa?", "o que
// bloqueia este aqui?", "este achado tem Ação escrita ou é só um título?" —
// sem varrer o arquivo inteiro. Pior: quatro defeitos de esteira só aparecem
// no cruzamento dos dois documentos, e nenhum é visível lendo um só.
//
// Uso:  node scripts/gerar-indice-achados.mjs
//       node scripts/gerar-indice-achados.mjs --check
//
// O índice é DERIVADO. Nunca edite `INDICE_ACHADOS.md` à mão — edite a fonte
// e regenere. O gate de integridade verifica que os dois estão em sincronia.
// ============================================================================

import fs from 'node:fs';

const PLANO = 'docs/audits/PLANO_IMPLEMENTACAO_100.md';
const ETAPAS = 'docs/audits/PLANO_CORRECAO_20_ETAPAS.md';
const SAIDA = 'docs/audits/INDICE_ACHADOS.md';

const ORDEM_SEV = ['SEC', 'QUEBRADO', 'RISCO', 'DEGRADADO', 'HIGIENE'];

function lerAchados() {
  const linhas = fs.readFileSync(PLANO, 'utf8').split('\n');
  const achados = [];
  let cur = null;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const cab = l.match(/^### (F\d+-\d+)\s*(.*)$/);
    if (cab) {
      cur = {
        id: cab[1],
        bloco: cab[1].split('-')[0],
        titulo: cab[2].replace(/^[\u2014-]\s*/, '').trim(),
        linha: i + 1,
        sev: null, dep: null, raiz: null, rollback: null,
        obsoleto: /OBSOLETO/.test(l),
        revalidado: false, temAcao: false, temAceite: false, temEvidencia: false,
      };
      achados.push(cur);
      continue;
    }
    if (!cur) continue;
    let m;
    if ((m = l.match(/^- \*\*Sev:\*\* *(.*)$/))) cur.sev = m[1].replace(/`/g, '').trim();
    else if ((m = l.match(/^- \*\*Depende de:\*\* *(.*)$/))) cur.dep = m[1].trim();
    else if ((m = l.match(/^- \*\*Raiz de:\*\* *(.*)$/))) cur.raiz = m[1].trim();
    else if ((m = l.match(/^- \*\*Rollback:\*\* *(.*)$/))) cur.rollback = m[1].replace(/`/g, '').trim();
    else if (/Revalidado em 20\d\d/.test(l)) cur.revalidado = true;
    else if (/^- \*\*A\u00e7\u00e3o/.test(l)) cur.temAcao = true;
    else if (/^- \*\*Aceite/.test(l)) cur.temAceite = true;
    else if (/^- \*\*Evid\u00eancia/.test(l)) cur.temEvidencia = true;
  }
  for (const a of achados) {
    a.sevNorm = a.obsoleto ? 'OBSOLETO' : (ORDEM_SEV.includes(a.sev) ? a.sev : (a.sev || '(sem Sev)'));
  }
  return achados;
}

function lerEtapas() {
  const linhas = fs.readFileSync(ETAPAS, 'utf8').split('\n');
  const etapas = [];
  let cur = null;
  for (const l of linhas) {
    const cab = l.match(/^#### Etapa (\d+)\s*[\u2014-]\s*(.*)$/);
    if (cab) {
      cur = {
        n: Number(cab[1]),
        nome: cab[2].replace(/\u00b7.*$/, '').replace(/\*\*/g, '').trim(),
        concluida: /CONCLU[I\u00cd]DA/i.test(l),
        achados: [],
      };
      etapas.push(cur);
      continue;
    }
    if (!cur) continue;
    const m = l.match(/^\*\*Achados:\*\*\s*(.*)$/);
    if (m && cur.achados.length === 0) cur.achados = m[1].match(/F\d+-\d+/g) || [];
  }
  return etapas;
}

function analisar(achados, etapas) {
  const porId = Object.fromEntries(achados.map((a) => [a.id, a]));
  const etapaDe = new Map();
  for (const e of etapas) for (const id of e.achados) {
    if (!etapaDe.has(id)) etapaDe.set(id, []);
    etapaDe.get(id).push(e.n);
  }
  const ativos = achados.filter((a) => !a.obsoleto);
  const orfaos = ativos.filter((a) => !etapaDe.has(a.id));
  const obsoletosAlocados = achados.filter((a) => a.obsoleto && etapaDe.has(a.id));
  const fantasmas = [...etapaDe.keys()].filter((id) => !porId[id]);
  const invertidas = [];
  for (const a of achados) {
    if (!a.dep) continue;
    const ea = etapaDe.get(a.id)?.[0] ?? null;
    if (ea === null) continue;
    for (const r of new Set(a.dep.match(/F\d+-\d+/g) || [])) {
      const er = etapaDe.get(r)?.[0] ?? null;
      if (er !== null && er > ea) invertidas.push({ de: a.id, ea, para: r, er });
    }
  }
  const semAcao = ativos.filter((a) => etapaDe.has(a.id) && !a.temAcao);
  return { porId, etapaDe, ativos, orfaos, obsoletosAlocados, fantasmas, invertidas, semAcao };
}

function badge(v) { return v ? 'sim' : '**nao**'; }

function render(achados, etapas, an) {
  const { etapaDe, ativos, orfaos, obsoletosAlocados, fantasmas, invertidas, semAcao } = an;
  const hoje = new Date().toISOString().slice(0, 10);
  const L = [];

  L.push('# INDICE DE ACHADOS \u2014 leia isto antes de abrir o plano');
  L.push('');
  L.push('> **Arquivo derivado. Nao edite a mao.** Regenere com `node scripts/gerar-indice-achados.mjs`');
  L.push('> depois de qualquer mudanca em `PLANO_IMPLEMENTACAO_100.md` ou `PLANO_CORRECAO_20_ETAPAS.md`.');
  L.push('> O gate `scripts/check-audit-docs-integrity.sh` reprova se este indice ficar dessincronizado.');
  L.push('>');
  L.push('> Gerado em ' + hoje + ' a partir de ' + achados.length + ' achados e ' + etapas.length + ' etapas.');
  L.push('');
  L.push('## Para que serve');
  L.push('');
  L.push('O `PLANO_IMPLEMENTACAO_100.md` tem 222 KB. Este indice responde, sem varrer o arquivo:');
  L.push('');
  L.push('- quais achados pertencem a etapa que vou executar;');
  L.push('- o que bloqueia cada achado (`Depende de:`) e se o bloqueador vem antes ou depois na esteira;');
  L.push('- se o achado tem **Acao** e **Aceite** escritos, ou se e so um titulo-resumo que precisa ser especificado antes;');
  L.push('- qual procedimento de rollback se aplica (`R-POL`, `R-FN`, `R-VIEW`, `R-CRON`, `R-DDL`, `R-CODE`) \u2014 ausencia significa que a Acao nao altera producao;');
  L.push('- em que linha do plano o corpo completo comeca.');
  L.push('');
  L.push('## Defeitos de esteira \u2014 leia antes de planejar a sessao');
  L.push('');
  L.push('Todos medidos por cruzamento dos dois documentos. Nenhum e visivel lendo um so.');
  L.push('');
  L.push('| # | Defeito | Qtd | Efeito pratico |');
  L.push('|---|---|---:|---|');
  L.push('| 1 | **Achados ativos sem etapa** | ' + orfaos.length + ' | Executar as 20 etapas na ordem **nao** esgota o backlog. Ficam de fora ' + orfaos.filter((a) => a.sevNorm === 'SEC').length + ' `SEC` e ' + orfaos.filter((a) => a.sevNorm === 'QUEBRADO').length + ' `QUEBRADO`. |');
  L.push('| 2 | **Dependencia em ordem invertida** | ' + invertidas.length + ' | O achado esta numa etapa anterior a do seu pre-requisito. Seguir a ordem numerica ativa bug latente ou desperdica a sessao. |');
  L.push('| 3 | **Obsoletos ainda alocados** | ' + obsoletosAlocados.length + ' | A etapa lista o achado, mas ele ja foi revalidado como falso positivo. O agente gasta tempo ate ler o veredito. |');
  L.push('| 4 | **Alocados sem Acao escrita** | ' + semAcao.length + ' | Sao titulos-resumo. Precisam de Acao e Aceite **antes** de entrar na esteira. |');
  if (fantasmas.length) L.push('| 5 | **Citados em etapa mas inexistentes** | ' + fantasmas.length + ' | ' + fantasmas.join(', ') + ' |');
  L.push('');

  if (invertidas.length) {
    L.push('### Dependencias em ordem invertida (detalhe)');
    L.push('');
    L.push('| Achado | Etapa | Depende de | Etapa do pre-requisito |');
    L.push('|---|---:|---|---:|');
    for (const i of invertidas) L.push('| `' + i.de + '` | ' + i.ea + ' | `' + i.para + '` | **' + i.er + '** |');
    L.push('');
    L.push('Encaminhamento: **nao** renumerar etapa nem mover achado por conta propria. Executar o pre-requisito antes e registrar o desvio no `RELATORIO_CORRECAO.md`, como foi feito com `F1-06` na Etapa 2.');
    L.push('');
  }

  if (obsoletosAlocados.length) {
    L.push('### Obsoletos ainda listados em etapas (nao executar)');
    L.push('');
    L.push(obsoletosAlocados.map((a) => '`' + a.id + '` (Etapa ' + etapaDe.get(a.id).join('/') + ')').join(' \u00b7 '));
    L.push('');
  }

  if (orfaos.length) {
    L.push('### Achados ativos que nenhuma etapa cobre');
    L.push('');
    L.push('Decidir explicitamente: alocar numa etapa existente, criar etapa nova, ou marcar fora de escopo com justificativa. **Silencio aqui vira divida invisivel.**');
    L.push('');
    L.push('| Sev | Achados |');
    L.push('|---|---|');
    for (const s of ORDEM_SEV) {
      const g = orfaos.filter((a) => a.sevNorm === s);
      if (g.length) L.push('| `' + s + '` | ' + g.map((a) => '`' + a.id + '`').join(' \u00b7 ') + ' |');
    }
    L.push('');
  }

  L.push('## Achados por etapa');
  L.push('');
  for (const e of etapas) {
    L.push('### Etapa ' + e.n + ' \u2014 ' + e.nome + (e.concluida ? ' \u2705' : ''));
    L.push('');
    if (!e.achados.length) { L.push('_Nenhum achado listado na linha `**Achados:**` desta etapa._'); L.push(''); continue; }
    L.push('| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |');
    L.push('|---|---|---|---|---|---|---:|');
    for (const id of e.achados) {
      const a = an.porId[id];
      if (!a) { L.push('| `' + id + '` | \u2014 | \u2014 | \u2014 | \u2014 | **inexistente no plano** | \u2014 |'); continue; }
      const dep = a.dep ? a.dep.replace(/\|/g, '\\|').slice(0, 60) : '\u2014';
      L.push('| `' + a.id + '`' + (a.obsoleto ? ' \u26d4' : '') + (a.revalidado ? ' \ud83d\udd04' : '') + ' | `' + a.sevNorm + '` | ' + badge(a.temAcao) + ' | ' + badge(a.temAceite) + ' | ' + (a.rollback || '\u2014') + ' | ' + dep + ' | ' + a.linha + ' |');
    }
    L.push('');
  }

  L.push('## Todos os ' + achados.length + ' achados');
  L.push('');
  L.push('`\u26d4` = obsoleto, fora da esteira. `\ud83d\udd04` = revalidado nas Etapas 1-3. Coluna **Etapa** vazia = nao alocado.');
  L.push('');
  L.push('| Achado | Sev | Etapa | Acao | Aceite | Rollback | Linha | Titulo |');
  L.push('|---|---|---:|---|---|---|---:|---|');
  const ordenados = [...achados].sort((a, b) => {
    const ba = Number(a.bloco.slice(1)), bb = Number(b.bloco.slice(1));
    if (ba !== bb) return ba - bb;
    return Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]);
  });
  for (const a of ordenados) {
    const et = an.etapaDe.get(a.id)?.join('/') ?? '';
    const marcas = (a.obsoleto ? '\u26d4' : '') + (a.revalidado ? '\ud83d\udd04' : '');
    const tit = a.titulo.replace(/\|/g, '\\|').replace(/~~/g, '').slice(0, 90);
    L.push('| `' + a.id + '` ' + marcas + ' | `' + a.sevNorm + '` | ' + et + ' | ' + badge(a.temAcao) + ' | ' + badge(a.temAceite) + ' | ' + (a.rollback || '\u2014') + ' | ' + a.linha + ' | ' + tit + ' |');
  }
  L.push('');
  L.push('---');
  L.push('');
  L.push('Resumo: ' + achados.length + ' achados \u00b7 ' + ativos.length + ' ativos \u00b7 ' + (achados.length - ativos.length) + ' obsoletos \u00b7 ' + an.etapaDe.size + ' alocados em etapa \u00b7 ' + orfaos.length + ' ativos sem etapa.');
  L.push('');
  return L.join('\n');
}

const achados = lerAchados();
const etapas = lerEtapas();
const an = analisar(achados, etapas);
const texto = render(achados, etapas, an);

if (process.argv.includes('--check')) {
  const atual = fs.existsSync(SAIDA) ? fs.readFileSync(SAIDA, 'utf8') : '';
  const norm = (s) => s.replace(/^> Gerado em .*$/m, '');
  if (norm(atual) !== norm(texto)) {
    console.error('::error title=Indice de achados::INDICE_ACHADOS.md esta dessincronizado. Rode: node scripts/gerar-indice-achados.mjs');
    process.exit(1);
  }
  console.log('Indice em sincronia: ' + achados.length + ' achados, ' + etapas.length + ' etapas.');
} else {
  fs.writeFileSync(SAIDA, texto);
  console.log(SAIDA + ' gerado: ' + achados.length + ' achados, ' + etapas.length + ' etapas, ' + an.orfaos.length + ' orfaos ativos, ' + an.invertidas.length + ' deps invertidas, ' + an.obsoletosAlocados.length + ' obsoletos alocados.');
}
