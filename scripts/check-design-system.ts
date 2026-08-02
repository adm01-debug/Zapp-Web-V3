import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { join, extname, relative } from 'path';
import { DS_CONFIG } from './ds-config';

const { WHITELIST, VARIANTS, FORBIDDEN_PATTERNS, IGNORE_DIRECTIVE, IGNORED_FILES, IGNORED_DIRS } = DS_CONFIG;

export interface Violation {
  file: string;
  line: number;
  match: string;
  cleanMatch: string;
  prefix: string;
  label: string;
  suggestion?: string;
  replacement?: string;
  priority: 'High' | 'Medium' | 'Low';
  context?: string;
}

const variantPrefixRegex = new RegExp(`^(?:(?:${VARIANTS.join('|')}):)+`, 'g');

export function getSuggestion(label: string, match: string, fileName?: string, context?: string): { suggestion: string, priority: Violation['priority'], replacement?: string, cleanMatch: string, prefix: string } {
  const prefixMatch = match.match(variantPrefixRegex);
  const prefix = prefixMatch ? prefixMatch[0] : '';
  const cleanMatch = match.replace(variantPrefixRegex, '').trim();

  // 1. Technical justifications first (Highest priority for preserving intentional non-standard colors)
  const technicalCases: Record<string, string> = {
    '#f1592a': 'PDF brand color',
    '#2b72c4': 'Microsoft Word brand color',
    '#1d6f42': 'Microsoft Excel brand color',
    '#d24726': 'Microsoft PowerPoint brand color',
    '#f8bc34': 'Archive/Zip file color',
    '#000000': 'OLED Black (Intentional)',
    '#4285f4': 'Google Blue',
    '#34a853': 'Google Green',
    '#fbbc05': 'Google Yellow',
    '#ea4335': 'Google Red',
    '#25d366': 'WhatsApp Green',
    '#1a73e8': 'Google UI Blue',
    '#f29900': 'Google UI Warning',
    '#e37400': 'Google UI Orange',
    '#d93025': 'Google UI Error',
    '#ccc': 'Canvas/Chart Neutral',
    '#888': 'Log/Technical Neutral',
    '#666': 'Log/Technical Dimmed',
    '#310': 'Legacy Technical Value',
    '#039': 'Legacy Link Color',
    '#0088fe': 'Metric Primary',
    '#00c49f': 'Metric Success',
    '#ffbb28': 'Metric Warning',
    '#ff8042': 'Metric Danger',
    '#9e9e9e': 'Gmail Muted Label',
    '#777777': 'Gmail Dimmed Label',
    '#251f33': 'Theme Background Constant',
  };

  const lookupMatch = cleanMatch.toLowerCase().replace(/bg-|text-|border-|\[|\]/g, '');
  const justification = technicalCases[lookupMatch];
  
  if (justification) {
    if (lookupMatch === '000000' && fileName && !fileName.endsWith('.css') && !fileName.includes('tailwind')) {
       // Proceed to mapping
    } else {
       return { cleanMatch, prefix, suggestion: `VALID: ${justification}`, priority: 'Low' };
    }
  }

  // Chart specific whitelist
  if (fileName && fileName.includes('chart.tsx') && (cleanMatch === '#ccc' || cleanMatch === '#fff')) {
    return { cleanMatch, prefix, suggestion: 'VALID: Chart selector constant', priority: 'Low' };
  }

  const isWhite = cleanMatch.includes('white') || cleanMatch.includes('#ffffff') || cleanMatch.includes('#fff');
  const isBlack = cleanMatch.includes('black') || cleanMatch.includes('#000000') || cleanMatch.includes('#000');

  if (label === 'Raw Hex' || label === 'Arbitrary Color' || label === 'Literal Color') {
    const isBg = cleanMatch.startsWith('bg-') || cleanMatch.startsWith('hover:bg-');
    const isText = cleanMatch.startsWith('text-') || cleanMatch.startsWith('hover:text-');
    const isBorder = cleanMatch.startsWith('border-') || cleanMatch.startsWith('hover:border-');

    if (label === 'Raw Hex' || (label === 'Arbitrary Color' && cleanMatch.includes('#'))) {
      const hex = (cleanMatch.match(/#[0-9a-fA-F]{3,6}/) || [])[0]?.toLowerCase();
      
      const isActuallyBg = cleanMatch.startsWith('bg-') || !cleanMatch.includes('-');
      const isActuallyText = cleanMatch.startsWith('text-');
      const isActuallyBorder = cleanMatch.startsWith('border-');

      if (hex) {
        if (['#fff', '#ffffff'].includes(hex)) {
           const baseReplacement = isActuallyBg ? 'bg-background' : (isActuallyText ? 'text-foreground' : (isActuallyBorder ? 'border-border' : undefined));
           if (baseReplacement) return { cleanMatch, prefix, suggestion: baseReplacement, priority: 'High', replacement: `${prefix}${baseReplacement}` };
        }
        if (['#000', '#000000'].includes(hex)) {
           const baseReplacement = isActuallyBg ? 'bg-foreground' : (isActuallyText ? 'text-background' : (isActuallyBorder ? 'border-border' : undefined));
           if (baseReplacement) return { cleanMatch, prefix, suggestion: baseReplacement, priority: 'High', replacement: `${prefix}${baseReplacement}` };
        }

        const hexMap: Record<string, string> = {
          '#ef4444': 'destructive', '#dc2626': 'destructive', '#f87171': 'destructive', '#fecaca': 'destructive', '#fef2f2': 'destructive',
          '#f59e0b': 'warning', '#eab308': 'warning', '#facc15': 'warning', '#fde047': 'warning', '#fef9c3': 'warning',
          '#3b82f6': 'primary', '#2563eb': 'primary', '#60a5fa': 'primary',
          '#10b981': 'success', '#059669': 'success', '#34d399': 'success', '#22c55e': 'success',
          '#8b5cf6': 'accent', '#7c3aed': 'accent',
          '#6b7280': 'muted', '#9ca3af': 'muted', '#d1d5db': 'muted', '#f3f4f6': 'muted'
        };

        if (hexMap[hex]) {
          const semantic = hexMap[hex];
          let baseReplacement = '';
          if (isActuallyBg) baseReplacement = `bg-${semantic}`;
          else if (isActuallyText) baseReplacement = `text-${semantic}`;
          else if (isActuallyBorder) baseReplacement = `border-${semantic}`;

          if (baseReplacement) {
            return { cleanMatch, prefix, suggestion: baseReplacement, priority: 'Medium', replacement: `${prefix}${baseReplacement}` };
          }
        }
      }
    }

    if (isWhite) {
       const baseReplacement = isBg ? 'bg-background' : (isText ? 'text-foreground' : (isBorder ? 'border-border' : undefined));
       const replacement = baseReplacement ? `${prefix}${baseReplacement}` : undefined;
       return { cleanMatch, prefix, suggestion: `${prefix}${baseReplacement || 'bg-background'}`, priority: 'High', replacement };
    }
    if (isBlack) {
       const baseReplacement = isBg ? 'bg-foreground' : (isText ? 'text-background' : (isBorder ? 'border-border' : undefined));
       const replacement = baseReplacement ? `${prefix}${baseReplacement}` : undefined;
       return { cleanMatch, prefix, suggestion: `${prefix}${baseReplacement || 'bg-foreground'}`, priority: 'High', replacement };
    }

    const semanticMap: Record<string, string> = {
      'red': 'destructive', 'rose': 'destructive', 'pink': 'destructive',
      'amber': 'warning', 'yellow': 'warning', 'orange': 'warning',
      'blue': 'primary', 'sky': 'info', 'cyan': 'info',
      'teal': 'success', 'emerald': 'success', 'green': 'success', 'lime': 'success',
      'slate': 'muted', 'gray': 'muted', 'zinc': 'muted', 'neutral': 'muted', 'stone': 'muted',
      'purple': 'accent', 'violet': 'accent', 'indigo': 'primary'
    };

    for (const [literal, semantic] of Object.entries(semanticMap)) {
      if (cleanMatch.includes(literal)) {
        let baseReplacement = '';
        if (isBg) baseReplacement = `bg-${semantic}`;
        else if (isText) baseReplacement = `text-${semantic}`;
        else if (isBorder) baseReplacement = `border-${semantic}`;

        if (baseReplacement) {
          const replacement = `${prefix}${baseReplacement}`;
          return { cleanMatch, prefix, suggestion: replacement, priority: 'Medium', replacement };
        }
      }
    }
  }

  if (label === 'Literal Color') {
    if (WHITELIST.colors.some(c => cleanMatch.endsWith(`-${c}`))) return { cleanMatch, prefix, suggestion: '', priority: 'Low' };
    return { cleanMatch, prefix, suggestion: 'Use semantic tokens (destructive, muted, primary, etc.)', priority: 'Medium' };
  }

  if (label === 'Literal Font') {
    const isTechnicalContext = context && (
      /\b(ids?|uuid|timestamp|date|created_at|updated_at|logs?|metrics?|counts?|phone|cnpj|cpf|values?|prices?|amounts?|charts?|graphs?|axis|ticks?|tokens?|hex|hash|sha|vers?|versions?|v\d+|métrica|valor|preço|gráfico|eixo|versão)\b|%/i.test(context) ||
      /<(code|pre|samp|kbd)\b/i.test(context) ||
      /\/\/\s*@technical/i.test(context)
    );
    // Only trust file name for very specific technical files
    const isTechnicalFile = fileName && /chart\.tsx|graph\.tsx|metrics?\.tsx|log\.tsx/i.test(fileName);
    
    if (cleanMatch === 'font-mono') {
      if (isTechnicalContext || isTechnicalFile) {
        return { cleanMatch, prefix, suggestion: 'VALID: Technical data (ID/Metric/Log)', priority: 'Low' };
      }
      return { cleanMatch, prefix, suggestion: 'Ensure font-mono is only for technical data (IDs, logs, metrics)', priority: 'Medium' };
    }

    if (cleanMatch === 'font-sans') {
      // Check if it's an intentional override (e.g., parent is mono on same line or commented)
      const isOverride = context && (/(font-mono|font-serif|font-display|mono|serif|display)/i.test(context) || /@override/i.test(context));
      if (isOverride) {
        return { cleanMatch, prefix, suggestion: 'VALID: Intentional font reset', priority: 'Low' };
      }
      return { cleanMatch, prefix, suggestion: 'Remove redundant font-sans; inherits from global', priority: 'High', replacement: '' };
    }
    
    return { cleanMatch, prefix, suggestion: 'Remove literal font; use global typography', priority: 'Low', replacement: '' };
  }

  return { cleanMatch, prefix, suggestion: 'Check design system tokens', priority: 'Low' };
}

export function scanContent(content: string, fileName: string, results: Violation[]) {
  const lines = content.split('\n');
  const variantsPart = `(?:(?:${VARIANTS.join('|')}):)*`;

  lines.forEach((line, index) => {
    if (line.includes(IGNORE_DIRECTIVE)) return;

    FORBIDDEN_PATTERNS.forEach(({ pattern, label }) => {
      const fullPattern = new RegExp(`${variantsPart}${pattern.source}`, 'g');
      
      let match;
      const seenOnLine = new Set<string>();
      while ((match = fullPattern.exec(line)) !== null) {
        const rawMatch = match[0].trim();
        if (!rawMatch || seenOnLine.has(rawMatch)) continue;
        seenOnLine.add(rawMatch);

        const { suggestion, priority, replacement, cleanMatch, prefix } = getSuggestion(label, rawMatch, fileName, line);
        
        const matchStart = match.index;
        if (matchStart > 1 && line.substring(matchStart - 2, matchStart) === '--') continue;
        
        if (label === 'Literal Color' && WHITELIST.colors.some(c => cleanMatch.endsWith(`-${c}`))) continue;
        
        if (suggestion || priority === 'High') {
          results.push({
            file: fileName,
            line: index + 1,
            match: rawMatch,
            cleanMatch,
            prefix: prefix || '(none)',
            label,
            suggestion,
            replacement,
            priority,
            context: line.trim()
          });
        }
      }
    });
  });
}

function scanDir(dir: string, results: Violation[]) {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir);

  for (const file of files) {
    const fullPath = join(dir, file);
    if (IGNORED_DIRS.some(d => fullPath.includes(d))) continue;
    if (statSync(fullPath).isDirectory()) {
      scanDir(fullPath, results);
      continue;
    }

    if (IGNORED_FILES.includes(file)) continue;
    if (!['.tsx', '.ts', '.css'].includes(extname(file))) continue;

    const content = readFileSync(fullPath, 'utf-8');
    scanContent(content, relative(process.cwd(), fullPath), results);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const applyPatch = args.includes('--apply-patch') || dryRun;
  const ci = args.includes('--ci');
  const pathArg = args.find(a => !a.startsWith('--') && !a.includes('='));
  const minPriorityArg = args.find(a => a.startsWith('--min-priority='))?.split('=')[1] || 'Low';
  
  const priorityMap = { 'High': 3, 'Medium': 2, 'Low': 1 };
  const minPriorityValue = priorityMap[minPriorityArg as keyof typeof priorityMap] || 1;

  const scanPath = pathArg || './src';
  const violations: Violation[] = [];
  
  if (!ci) {
    console.log(`🔍 Scanning ${scanPath} (min-priority: ${minPriorityArg})...`);
  }

  if (!existsSync(scanPath)) {
    console.error(`❌ Path does not exist: ${scanPath}`);
    process.exit(1);
  }

  if (statSync(scanPath).isDirectory()) {
    scanDir(scanPath, violations);
  } else {
    const content = readFileSync(scanPath, 'utf-8');
    scanContent(content, relative(process.cwd(), scanPath), violations);
  }

  const filteredViolations = violations.filter(v => priorityMap[v.priority] >= minPriorityValue);

  if (filteredViolations.length === 0) {
    console.log('✅ No design system violations found.');
    process.exit(0);
  }

  const groupedViolations: Record<string, Violation[]> = {};
  filteredViolations.forEach(v => {
    if (!groupedViolations[v.file]) groupedViolations[v.file] = [];
    groupedViolations[v.file].push(v);
  });

  if (applyPatch) {
    console.log(dryRun ? '\n--- 🧪 Dry Run: Proposed Changes ---' : '\n--- 🛠 Applying Patches ---');
    let totalFilesChanged = 0;
    let totalSubstitutions = 0;

    Object.entries(groupedViolations).forEach(([file, fileViolations]) => {
      const originalContent = readFileSync(file, 'utf-8');
      let currentContent = originalContent;
      let hasChanges = false;
      let fileSubstitutions = 0;
      
      const sortedViolations = [...fileViolations].sort((a, b) => b.match.length - a.match.length);

      sortedViolations.forEach(v => {
        if (v.replacement !== undefined && currentContent.includes(v.match)) {
          const escapedMatch = v.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(?<!-)${escapedMatch}(?!-)`, 'g');
          const newContent = currentContent.replace(regex, v.replacement);
          
          if (currentContent !== newContent) {
            currentContent = newContent;
            hasChanges = true;
            fileSubstitutions++;
          }
        }
      });
      
      if (hasChanges) {
        totalFilesChanged++;
        totalSubstitutions += fileSubstitutions;
        if (!dryRun) {
          writeFileSync(file, currentContent);
          console.log(`✅ Updated ${file} (${fileSubstitutions} changes applied)`);
        }
      }
    });

    console.log(`\nSummary: ${totalSubstitutions} substitutions across ${totalFilesChanged} files.`);
  } else {
    let mdReport = `# Design System Audit\n\n`;
    Object.entries(groupedViolations).forEach(([file, fileViolations]) => {
      mdReport += `## ${file}\n| Priority | Line | Raw Match | Clean | Suggestion | Patch |\n|---|---|---|---|---|---|\n`;
      fileViolations.forEach(v => {
        mdReport += `| ${v.priority} | ${v.line} | \`${v.match}\` | \`${v.cleanMatch}\` | ${v.suggestion} | ${v.replacement ? `\`${v.replacement}\`` : '-'} |\n`;
      });
    });
    writeFileSync('design-system-audit.md', mdReport);
    console.log(`📝 Generated audit report: design-system-audit.md (${filteredViolations.length} violations)`);
  }

  if (ci) {
    const maxArg = process.argv.slice(2).find((a) => a.startsWith('--max='));
    const maxAllowed = maxArg ? Number(maxArg.split('=')[1]) : 0;
    const count = filteredViolations.length;
    if (count > maxAllowed) {
      console.error(`\n🚨 Design System: ${count} violações — teto do ratchet é ${maxAllowed}. Reduza as violações ou suba o teto conscientemente.`);
      process.exit(1);
    }
    if (count < maxAllowed) {
      console.log(`\n✅ Design System: ${count} violações (teto ${maxAllowed}) — aperte o ratchet para ${count}.`);
    } else {
      console.log(`\n✅ Design System: ${count} violações — exatamente no teto do ratchet.`);
    }
  }
}
