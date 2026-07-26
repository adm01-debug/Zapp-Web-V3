#!/usr/bin/env node
/**
 * E46 — Regression Test Requirement Gate
 *
 * Enforces that every PR whose title or commits start with "fix:" includes
 * at least one test-file change. This closes the loop between bug fixes and
 * the regression tests that protect them.
 *
 * Usage:
 *   CHANGED_FILES="..." PR_TITLE="..." COMMIT_MESSAGES="..." node scripts/check-fix-regression-test.mjs
 *
 * Environment variables:
 *   CHANGED_FILES    — newline-separated list of changed files in the PR
 *   PR_TITLE         — the PR title (checked for "fix:" prefix)
 *   COMMIT_MESSAGES  — newline-separated list of commit messages (each checked for "fix:" prefix)
 *   ADVISORY         — if "true", always exit 0 (emit warning only)
 */

const CHANGED_FILES = (process.env.CHANGED_FILES ?? '').split('\n').map(s => s.trim()).filter(Boolean);
const PR_TITLE = (process.env.PR_TITLE ?? '').trim();
const COMMIT_MESSAGES = (process.env.COMMIT_MESSAGES ?? '').split('\n').map(s => s.trim()).filter(Boolean);
const ADVISORY = process.env.ADVISORY === 'true';

const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /src\/tests?\//,
  /src\/__tests__\//,
  /__tests__\//,
  /cypress\//,
  /e2e\//,
  /test\//,
];

function isFixCommit(msg) {
  return /^fix(\(.*?\))?[!:]/.test(msg.toLowerCase());
}

function isTestFile(path) {
  return TEST_PATTERNS.some(re => re.test(path));
}

const hasFix = isFixCommit(PR_TITLE) || COMMIT_MESSAGES.some(isFixCommit);

if (!hasFix) {
  console.log('ℹ️  No fix: commits or fix: PR title detected — regression test check skipped.');
  process.exit(0);
}

const testFiles = CHANGED_FILES.filter(isTestFile);
const nonTestFiles = CHANGED_FILES.filter(f => !isTestFile(f));

console.log('\n## E46 — Regression Test Requirement\n');
console.log(`PR title     : ${PR_TITLE || '(not set)'}`);
console.log(`Fix commits  : ${COMMIT_MESSAGES.filter(isFixCommit).length}`);
console.log(`Changed files: ${CHANGED_FILES.length} total, ${testFiles.length} test file(s)\n`);

if (testFiles.length > 0) {
  console.log('✅ Test files changed:');
  testFiles.forEach(f => console.log(`   ${f}`));
  console.log('\n✅ Regression test requirement satisfied.');
  process.exit(0);
}

const message = [
  '❌ E46: fix: PR/commit detected but no test files changed.',
  '',
  'Every bug fix should be accompanied by a regression test that would have',
  'caught the original defect. Add or update at least one test file:',
  '  • Unit/integration: src/**/*.test.ts or src/**/*.spec.ts',
  '  • E2E:              src/tests/e2e/**/*.spec.ts',
  '',
  'Changed non-test files:',
  ...nonTestFiles.slice(0, 10).map(f => `  ${f}`),
  ...(nonTestFiles.length > 10 ? [`  ... and ${nonTestFiles.length - 10} more`] : []),
  '',
  'If a test is genuinely not applicable (e.g. CI/config-only fix),',
  'add a commit with [skip-e46] in its message to bypass this check.',
].join('\n');

if (ADVISORY) {
  console.warn(`::warning title=E46 Regression Test::${message.replace(/\n/g, '%0A')}`);
  console.log('\n⚠️  Advisory mode — not blocking CI.');
  process.exit(0);
} else {
  console.error(message);
  process.exit(1);
}
