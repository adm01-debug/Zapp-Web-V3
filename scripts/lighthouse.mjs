#!/usr/bin/env node
/**
 * Lighthouse CI script — F10-07
 * Roda auditoria de performance na URL de produção.
 * Uso: node scripts/lighthouse.mjs [url]
 * Saída: relatório em .hermes/lighthouse-report.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const URL = process.argv[2] || process.env.VITE_APP_URL || 'https://app.atomicabr.com.br';
const API_KEY = process.env.PAGESPEED_API_KEY || '';

if (!API_KEY) {
  console.log('⚠️ PAGESPEED_API_KEY não configurada. Pulando Lighthouse.');
  console.log('   Configure em: https://developers.google.com/speed/docs/insights/v5/get-started');
  process.exit(0);
}

const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(URL)}&key=${API_KEY}&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo`;

try {
  const res = await fetch(apiUrl);
  const json = await res.json();
  
  mkdirSync('.hermes', { recursive: true });
  writeFileSync('.hermes/lighthouse-report.json', JSON.stringify(json, null, 2));
  
  const categories = json.lighthouseResult?.categories || {};
  for (const [name, cat] of Object.entries(categories)) {
    const score = Math.round((cat.score || 0) * 100);
    const emoji = score >= 90 ? '🟢' : score >= 50 ? '🟡' : '🔴';
    console.log(`${emoji} ${name}: ${score}/100`);
  }
} catch (e) {
  console.error('Lighthouse falhou:', e instanceof Error ? e.message : String(e));
  process.exit(0); // não quebrar CI
}
