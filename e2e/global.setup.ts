import { test as setup } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { loginViaUI } from './fixtures/auth';

const STORAGE_STATE = path.resolve(process.cwd(), 'e2e/.auth/user.json');

/**
 * Project `setup` do Playwright: executa uma única vez antes dos demais
 * specs e grava `e2e/.auth/user.json` com a sessão autenticada.
 */
setup('authenticate', async ({ page }) => {
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await loginViaUI(page);
  await page.context().storageState({ path: STORAGE_STATE });
});
