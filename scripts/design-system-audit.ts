import * as fs from 'fs';
import * as path from 'path';

const projectRoot = process.cwd();
const srcDir = path.join(projectRoot, 'src');

const config = {
  prohibitedColors: [
    'bg-white', 'bg-black', 'text-white', 'text-black',
    'bg-red-', 'bg-blue-', 'bg-green-', 'bg-yellow-', 'bg-slate-', 'bg-gray-', 'bg-zinc-', 'bg-neutral-', 'bg-stone-',
    'text-red-', 'text-blue-', 'text-green-', 'text-yellow-', 'text-slate-', 'text-gray-', 'text-zinc-', 'text-neutral-', 'text-stone-',
    'border-red-', 'border-blue-', 'border-green-', 'border-yellow-', 'border-slate-', 'border-gray-', 'border-zinc-', 'border-neutral-', 'border-stone-',
    '#', // Hex codes
  ],
  allowedTokens: [
    'primary', 'secondary', 'accent', 'destructive', 'muted', 'popover', 'card', 'background', 'foreground', 'border', 'input', 'ring'
  ],
  prohibitedFonts: ['font-inter'],
  fileExtensions: ['.tsx', '.ts', '.css'],
  // Files where hex colors are legitimately required (vendor SVG specs, console CSS, color pickers)
  excludeFiles: [
    'src/pages/Auth.tsx',                                  // Google OAuth SVG — brand colors required by Google identity guidelines
    'src/components/ui/chart.tsx',                         // shadcn/ui generated — Recharts attribute selectors use #ccc internally
    'src/components/ui/micro-interactions/buttons.tsx',    // CSS mask uses #fff as mask alpha (not a display color)
    'src/components/queues/CreateQueueDialog.tsx',         // Color picker palette — hex is user-selectable queue color data
    'src/components/tags/TagsView.tsx',                    // Color picker palette — hex is user-selectable tag color data
    'src/pages/admin/AdminChannelsPage.tsx',               // Color picker default — hex stored in DB as channel color
    'src/pages/admin/AdminQueuesPage.tsx',                 // Color picker default — hex stored in DB as queue color
    'src/pages/admin/queues/QueueEditDialog.tsx',          // Color picker input — hex is user color preference
    'src/features/admin/hooks/useAdminManagement.ts',      // Color picker default param — hex stored in DB as channel color
  ],
};

interface Violation {
  file: string;
  line: number;
  content: string;
  type: string;
}

function scanDir(dir: string, results: Violation[] = []) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const skipDirs = ['node_modules', '.git', 'dist', '__tests__', '__test__', 'stories', '__stories__', 'test', 'tests'];
      if (!skipDirs.includes(file)) {
        scanDir(fullPath, results);
      }
    } else if (config.fileExtensions.includes(path.extname(file)) && !file.match(/\.(test|spec)\.[tj]sx?$/)) {
      const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');
      if (config.excludeFiles.some(excl => relativePath.endsWith(excl) || relativePath === excl)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Skip imports, comments, and audit-ignored lines
        const trimmed = line.trim();
        if (
          trimmed.startsWith('import ') ||
          trimmed.startsWith('//') ||
          trimmed.startsWith('*') ||
          trimmed.startsWith('/*') ||
          trimmed.startsWith('#!')  // shebangs
        ) return;
        if (line.includes('// audit-ok') || line.includes('/* audit-ok')) return;

        // Strip inline comments before hex detection (handles trailing /* ... */ on CSS lines)
        const lineWithoutInlineComment = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
        // Check for hex codes — only exact valid CSS lengths (3, 4, 6, 8 digits)
        // Negative lookbehind skips HTML entities (&#nnn;) and badge/ID text (#12345)
        const hexMatch = lineWithoutInlineComment.match(/(?<!&)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/);
        if (hexMatch && !lineWithoutInlineComment.includes('var(--')) {
            results.push({
                file: path.relative(projectRoot, fullPath),
                line: index + 1,
                content: line.trim(),
                type: 'Hardcoded Hex Color'
            });
        }

        // Check for literal tailwind colors
        config.prohibitedColors.forEach(pattern => {
          if (pattern === '#' ) return; // handled above
          const regex = new RegExp(`\\b${pattern.replace('-', '\\-')}[a-z0-9-]*\\b`, 'g');
          const matches = line.match(regex);
          if (matches) {
            // Exclude allowed tokens if they happen to contain the pattern
            const filtered = matches.filter(m => !config.allowedTokens.some(token => m.includes(token)));
            if (filtered.length > 0) {
              results.push({
                file: path.relative(projectRoot, fullPath),
                line: index + 1,
                content: line.trim(),
                type: `Literal Tailwind Color (${filtered.join(', ')})`
              });
            }
          }
        });

        // Check for fonts
        config.prohibitedFonts.forEach(font => {
          if (line.includes(font)) {
            results.push({
              file: path.relative(projectRoot, fullPath),
              line: index + 1,
              content: line.trim(),
              type: 'Hardcoded Font Family'
            });
          }
        });
      });
    }
  }
  return results;
}

const violations = scanDir(srcDir);

const markdownReport = `
# Design System Audit Report
Generated on: ${new Date().toLocaleString()}

Total violations found: ${violations.length}

| File | Line | Type | Content |
|------|------|------|---------|
${violations.map(v => `| ${v.file} | ${v.line} | ${v.type} | \`${v.content.substring(0, 50)}${v.content.length > 50 ? '...' : ''}\` |`).join('\n')}
`;

const htmlReport = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Design System Audit</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; padding: 2rem; background: #f4f4f9; }
        h1 { color: #1a1a1a; }
        .summary { background: #fff; padding: 1rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 2rem; }
        table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #3b82f6; color: white; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 0.05rem; }
        tr:hover { background: #f9fafb; }
        code { background: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 0.9rem; }
        .type { font-weight: bold; color: #ef4444; }
    </style>
</head>
<body>
    <h1>Design System Audit Report</h1>
    <div class="summary">
        <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Total violations:</strong> ${violations.length}</p>
    </div>
    <table>
        <thead>
            <tr>
                <th>File</th>
                <th>Line</th>
                <th>Type</th>
                <th>Content</th>
            </tr>
        </thead>
        <tbody>
            ${violations.map(v => `
                <tr>
                    <td>${v.file}</td>
                    <td>${v.line}</td>
                    <td class="type">${v.type}</td>
                    <td><code>${v.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></td>
                </tr>
            `).join('')}
        </tbody>
    </table>
</body>
</html>
`;

fs.writeFileSync('design-system-audit.md', markdownReport);
fs.writeFileSync('design-system-audit.html', htmlReport);

console.log('Reports generated: design-system-audit.md, design-system-audit.html');
if (violations.length > 0) {
    console.log('Found ' + violations.length + ' violations.');
} else {
    console.log('No violations found!');
}
