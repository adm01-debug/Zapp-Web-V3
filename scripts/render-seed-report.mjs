#!/usr/bin/env node
/**
 * Renderiza um relatório HTML a partir de 1..N arquivos JSON de summary
 * emitidos pelos seeds E2E (marcador RAISE NOTICE 'E2E_SEED_SUMMARY_JSON:...').
 *
 * Uso:
 *   node scripts/render-seed-report.mjs <out.html> <summary1.json> [summary2.json ...]
 *
 * Também escreve um bloco Markdown compacto em stdout — ideal para tee em
 * $GITHUB_STEP_SUMMARY.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const [outPath, ...inputs] = process.argv.slice(2);
if (!outPath || inputs.length === 0) {
  console.error('uso: render-seed-report.mjs <out.html> <summary.json>...');
  process.exit(2);
}

const esc = (v) =>
  String(v ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const summaries = inputs.map((p) => {
  try {
    return { file: basename(p), data: JSON.parse(readFileSync(p, 'utf8')) };
  } catch (err) {
    return { file: basename(p), error: err.message };
  }
});

const rows = summaries
  .map(({ file, data, error }) => {
    if (error) {
      return `<tr class="err"><td colspan="4"><b>${esc(file)}</b> — falha ao ler: ${esc(error)}</td></tr>`;
    }
    if (data.kind === 'user') {
      return `
        <tr>
          <td><span class="badge badge-user">user</span></td>
          <td><code>${esc(data.email)}</code><br/><small>id: ${esc(data.user_id)}</small></td>
          <td><span class="pill pill-${esc(data.user_action)}">${esc(data.user_action)}</span></td>
          <td>
            <b>${esc(data.roles_total)}</b> roles
            <span class="delta">(+${esc(data.roles_added)} novos, ${esc(data.roles_existing)} pré-existentes)</span><br/>
            ${(data.roles ?? []).map((r) => `<code class="role">${esc(r)}</code>`).join(' ')}
          </td>
        </tr>`;
    }
    if (data.kind === 'contacts') {
      const cols = Object.entries(data.columns || {})
        .map(([k, v]) => `<code class="role ${v ? 'on' : 'off'}">${esc(k)}${v ? '' : '✗'}</code>`)
        .join(' ');
      return `
        <tr>
          <td><span class="badge badge-contacts">contacts</span></td>
          <td><code>${esc(data.table)}</code></td>
          <td>
            <b>${esc(data.total)}</b> registros
            <span class="delta">(${esc(data.inserted)} inseridos, ${esc(data.updated)} atualizados)</span>
          </td>
          <td>${cols}</td>
        </tr>`;
    }
    return `<tr><td colspan="4"><pre>${esc(JSON.stringify(data, null, 2))}</pre></td></tr>`;
  })
  .join('\n');

const ts = new Date().toISOString();
const html = `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<title>ZAPP Web — Seed E2E report (${ts})</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; margin: 24px; max-width: 960px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color:#6b7280; margin-bottom: 20px; }
  table { border-collapse: collapse; width: 100%; background:#fff; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th { background:#f9fafb; font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.5px; color:#374151; }
  code { background:#f3f4f6; padding:1px 6px; border-radius:4px; font-size:12px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; }
  .badge-user { background:#dbeafe; color:#1e40af; }
  .badge-contacts { background:#dcfce7; color:#166534; }
  .pill { display:inline-block; padding:2px 8px; border-radius:4px; font-size:12px; font-weight:600; }
  .pill-inserted { background:#dcfce7; color:#166534; }
  .pill-updated  { background:#fef3c7; color:#92400e; }
  .delta { color:#6b7280; font-size:12px; margin-left:6px; }
  .role { margin-right:2px; }
  .role.off { opacity:.4; text-decoration: line-through; }
  tr.err td { background:#fee2e2; color:#991b1b; }
  pre { margin:0; white-space: pre-wrap; }
  @media (prefers-color-scheme: dark) {
    body { background:#0b0f19; color:#e5e7eb; }
    table { background:#111827; }
    th { background:#1f2937; color:#d1d5db; }
    td { border-color:#1f2937; }
    code { background:#1f2937; color:#e5e7eb; }
  }
</style>
</head>
<body>
  <h1>🌱 Seed E2E — Relatório de Auditoria</h1>
  <div class="sub">Gerado em <code>${esc(ts)}</code> · ${summaries.length} operação(ões)</div>
  <table>
    <thead>
      <tr><th>Tipo</th><th>Alvo</th><th>Resultado</th><th>Detalhes</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;

writeFileSync(outPath, html, 'utf8');

// Markdown compacto (para $GITHUB_STEP_SUMMARY)
const md = ['### 🌱 Seed E2E — Resumo', '', '| Tipo | Alvo | Resultado | Detalhes |', '|---|---|---|---|'];
for (const { file, data, error } of summaries) {
  if (error) {
    md.push(`| ⚠️ | \`${file}\` | erro | ${error} |`);
    continue;
  }
  if (data.kind === 'user') {
    md.push(
      `| user | \`${data.email}\` | **${data.user_action}** | roles=**${data.roles_total}** (+${data.roles_added} novos): ${(data.roles ?? []).map((r) => `\`${r}\``).join(', ')} |`,
    );
  } else if (data.kind === 'contacts') {
    md.push(
      `| contacts | \`${data.table}\` | **${data.total}** registros | ${data.inserted} inseridos · ${data.updated} atualizados |`,
    );
  }
}
process.stdout.write(md.join('\n') + '\n');
