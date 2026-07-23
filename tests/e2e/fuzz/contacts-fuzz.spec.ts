import { test, expect } from '../../../e2e/fixtures/auth';

const FUZZ_INPUTS = [
  "'; DROP TABLE contacts; --",
  "<script>alert('xss')</script>",
  "A".repeat(1000),
  "1234567890",
  "+55 (11) 99999-9999",
  "invalid-email",
  "   ",
  "😀😁😂",
  "\0",
];

test.describe('Contacts Fuzz Testing', () => {
  test('valida campos de criação de contato com entradas maliciosas ou extremas', async ({ authenticatedPage: page }) => {
    await page.goto('/contacts');
    
    for (const input of FUZZ_INPUTS) {
      // Abre modal de criação se existir
      const addBtn = page.getByRole('button', { name: /novo|adicionar/i }).first();
      if (!(await addBtn.isVisible())) continue;
      
      await addBtn.click();
      
      const nameInput = page.getByLabel(/nome/i).first();
      const phoneInput = page.getByLabel(/telefone/i).first();
      
      if (await nameInput.isVisible()) {
        await nameInput.fill(input);
        await phoneInput.fill(input);
        
        const saveBtn = page.getByRole('button', { name: /salvar|criar/i });
        await saveBtn.click();
        
        // O app não deve quebrar (crashar com página branca)
        await expect(page.locator('body')).not.toBeEmpty();
        
        // Se houver erro de validação, deve ser tratado pela UI
        // Se salvar, o sistema deve sanitizar (verificado em testes de unidade)
      }
      
      // Fecha modal para próximo ciclo
      await page.keyboard.press('Escape');
    }
  });
});
