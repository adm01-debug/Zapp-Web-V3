#!/usr/bin/env node
// E09 — triagem automática 1ª passada
// Lê baseline.json, aplica heurísticas por diretório, emite triagem.csv
// Colunas: path;classe_sugerida;justificativa;consumidores;destino_path;etapa
// Fase 1 do plano AUDIT_EVO_REFS_20260816
import fs from "node:fs";
import path from "node:path";

const REPO = "C:/Users/Joaquim/hermes-workspaces/audit-evo-refs-20260816";
const OUTDIR = path.join(REPO, "docs", "decouple", "AUDIT_EVO_REFS_20260816");
const baseline = JSON.parse(fs.readFileSync(path.join(OUTDIR, "baseline.json"), "utf8"));
const universe = baseline.universe;

function classify(p) {
  const lp = p.toLowerCase();
  // R1 — migrations imutáveis
  if (lp.startsWith("supabase/migrations/") || lp.startsWith("db/migrations/"))
    return ["FICA", "R1: migracao imutavel"];
  // Gates de CI — nunca enfraquecer
  if (p === ".deno-lint-rules/no-direct-evo-url.ts" ||
      p.includes("evo-ddl-gate") || p.includes("evo-ddl-allowlist") ||
      lp.startsWith(".github/workflows/"))
    return ["FICA", "gate/enforcement CI (E77-E78)"];
  // _shared de edge functions + functions = contrato vivo
  if (lp.startsWith("supabase/functions/"))
    return ["FICA", "camada de contrato edge (Fase 4 valida vida)"];
  // src = front consumidor
  if (lp.startsWith("src/"))
    return ["FICA", "front consumidor (Fase 5 caca dead code)"];
  // já arquivados ficam
  if (lp.startsWith("docs/_archive/"))
    return ["FICA", "ja em archive"];
  // runbook de operação da Evo → MIGRA candidato (ANTES do histórico genérico)
  if (lp.startsWith("docs/runbook-evolution/") || lp.includes("runbook_evo") ||
      lp.includes("dr_runbook_evo"))
    return ["MIGRA", "operacao da infra Evolution (Fase 2/3 confirma)"];
  // docs de auditoria histórica raiz → ARQUIVA candidato
  if (lp.startsWith("docs/") && lp.includes("evolution") &&
      (lp.includes("audit") || lp.includes("sessao") || lp.includes("execucao") ||
       lp.includes("validacao") || lp.includes("simulacao") || lp.includes("remediacao") ||
       lp.includes("handoff") || lp.includes("incidente") || lp.includes("runbook")))
    return ["ARQUIVA", "historico de auditoria/incidente (Fase 2 confirma)"];
  // FMEA/referência viva → REVISAR manual
  if (lp.includes("fmea") || lp.includes("reference") || lp.includes("boundary"))
    return ["FICA", "doc vivo de fronteira — revisao manual E20/E21/E29"];
  // decouple = plano 100E vivo
  if (lp.startsWith("docs/decouple/"))
    return ["FICA", "registro do plano 100E (vivo ate fechar)"];
  // stacks residuais → EXCLUI candidato (comparar com evolution-stack)
  if (lp.startsWith("infra/stacks/") || lp.includes(".reconciled.deprecated"))
    return ["EXCLUI", "stacks devem morar no evolution-stack (E80 diffs)"];
  if (lp.startsWith("infra/") && lp.includes("evolution"))
    return ["MIGRA", "infra Evolution — dono e evolution-stack (E80)"];
  // .hermes = working files
  if (lp.startsWith(".hermes/"))
    return ["EXCLUI", "working file de sessao"];
  // e2e = contrato vivo
  if (lp.startsWith("e2e/"))
    return ["FICA", "e2e do contrato (E79)"];
  // scripts decouple = revisão manual (gates FICA, one-shot ARQUIVA)
  if (lp.startsWith("scripts/decouple/"))
    return ["FICA", "script decouple — E82 tria one-shot"];
  if (lp.startsWith("scripts/"))
    return ["FICA", "script — revisao manual Fase 7"];
  // graphify gerado
  if (lp.startsWith("graphify-out/"))
    return ["FICA", "artefato gerado"];
  // docs estruturais restantes
  if (lp.startsWith("docs/"))
    return ["FICA", "doc estrutural — revisao Fase 3"];
  // resto
  return ["FICA", "default conservador (R3)"];
}

const rows = [];
for (const p of universe) {
  const [classe, just] = classify(p);
  rows.push([p, classe, just, "", "", ""]);
}

// assert E11: linhas == universo
if (rows.length !== universe.length) {
  console.error(`ASSERT FAIL: ${rows.length} linhas != ${universe.length} universo`);
  process.exit(1);
}

const csv = ["path;classe_sugerida;justificativa;consumidores;destino_path;etapa",
  ...rows.map((r) => r.map((c) => (c.includes(";") ? `"${c}"` : c)).join(";"))].join("\n") + "\n";
fs.writeFileSync(path.join(OUTDIR, "triagem.csv"), csv, "utf8");

// contagem por classe
const counts = {};
for (const r of rows) counts[r[1]] = (counts[r[1]] || 0) + 1;
console.log("triagem.csv OK — linhas:", rows.length);
console.log("por classe:", JSON.stringify(counts));

// CSV reverso (evolution-stack → zapp) — E12
const revRows = baseline.inventory_c.map((p) => [p, "PENDENTE", "Fase 8B define CORRIGE-LABEL/CORRIGE-COMMENT/VALIDA-CONTRATO"]);
const revCsv = ["path;classe;justificativa", ...revRows.map((r) => r.join(";"))].join("\n") + "\n";
fs.writeFileSync(path.join(OUTDIR, "triagem-reversa.csv"), revCsv, "utf8");
console.log("triagem-reversa.csv OK — linhas:", revRows.length);
