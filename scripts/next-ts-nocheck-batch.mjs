#!/usr/bin/env node
/**
 * Onda automatizada de remoção de @ts-nocheck.
 *
 * Uso:
 *   node scripts/next-ts-nocheck-batch.mjs --pattern "src/hooks/analytics/**"
 *   node scripts/next-ts-nocheck-batch.mjs --limit 20
 *
 * Estratégia:
 *  1. Lista arquivos que contêm '// @ts-nocheck' na primeira linha.
 *  2. Para cada arquivo:
 *     a. remove a diretiva (backup em memória)
 *     b. roda `bunx tsgo --noEmit` no projeto inteiro
 *     c. filtra os erros pelo caminho do arquivo
 *     d. se 0 erros → mantém a remoção
 *     e. se >0 → restaura a diretiva e registra o motivo
 *  3. Grava relatório em docs/audit/ts-nocheck-batch-<timestamp>.md
 *
 * Não faz commits. Não trava o build. Sempre encerra com exit 0.
 */
import { readFile, writeFile } from "node:fs/promises";
import { execSync, spawnSync } from "node:child_process";
import { glob } from "node:fs/promises";
import { argv } from "node:process";

const args = new Map();
for (let i = 2; i < argv.length; i += 2) args.set(argv[i], argv[i + 1]);
const rawPattern = args.get("--pattern") ?? "src/**/*.{ts,tsx}";
// Allowlist: only safe glob characters — prevents indirect command injection via --pattern
const SAFE_GLOB = /^[a-zA-Z0-9_/.*{}[\],\-]+$/;
const pattern = SAFE_GLOB.test(rawPattern) ? rawPattern : "src/**/*.{ts,tsx}";
const limit = Number(args.get("--limit") ?? 25);

// Listagem via ripgrep (mais rápido que globbing puro)
// Use spawnSync with array args (no shell) + allowlist-validated pattern
const rgResult = spawnSync("rg", ["-l", "--no-messages", "^// @ts-nocheck", "-g", pattern, "src"], { encoding: "utf8" });
const listing = (rgResult.stdout ?? "").split("\n").filter(Boolean).slice(0, limit);

console.log(`> ${listing.length} arquivos candidatos`);

const report = [];
for (const path of listing) {
  const original = await readFile(path, "utf8");
  if (!original.startsWith("// @ts-nocheck")) continue;
  const stripped = original.replace(/^\/\/ @ts-nocheck\s*\n?/, "");
  await writeFile(path, stripped, "utf8");

  let output = "";
  try {
    execSync("bunx tsgo --noEmit", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    output = (err.stdout ?? "") + (err.stderr ?? "");
  }

  const fileErrors = output.split("\n").filter(l => l.includes(path));
  if (fileErrors.length === 0) {
    report.push({ path, status: "removed" });
    console.log(`✅ ${path}`);
  } else {
    await writeFile(path, original, "utf8");
    report.push({ path, status: "blocked", errors: fileErrors.length, sample: fileErrors[0] });
    console.log(`⛔ ${path} — ${fileErrors.length} erros`);
  }
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const md = [
  `# Onda ts-nocheck — ${timestamp}`,
  ``,
  `| Arquivo | Status | Erros | Amostra |`,
  `|---------|--------|-------|---------|`,
  ...report.map(r => `| \`${r.path}\` | ${r.status} | ${r.errors ?? 0} | ${r.sample ?? "—"} |`),
].join("\n");
await writeFile(`docs/audit/ts-nocheck-batch-${timestamp}.md`, md, "utf8");
console.log(`\nRelatório: docs/audit/ts-nocheck-batch-${timestamp}.md`);
