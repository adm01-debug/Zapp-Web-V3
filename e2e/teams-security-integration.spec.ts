import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/testHelpers';

/**
 * Integration Tests for Teams Module - RBAC & RLS Enforcement.
 * This suite validates strict data isolation between departments and correct administrative oversight.
 */
test.describe('Teams - RBAC & RLS Enforcement @teams', () => {
  // Global timeout for the suite to handle multiple user logins and potential cold starts
  test.setTimeout(180000);

  // Helper to determine the role being tested (for matrix execution)
  const roleUnderTest = process.env.E2E_ROLE_UNDER_TEST || 'ti_admin';

  test(`Visibility Check for ${roleUnderTest}`, async ({ page }) => {
    // 1. Authenticate and stabilize
    await loginAs(page, roleUnderTest as any);
    await page.waitForURL(/\/team-chat/, { waitUntil: 'networkidle', timeout: 30000 });

    // 2. Wait for the primary container to be ready
    const conversationList = page.getByRole('listbox', { name: /lista de conversas/i });
    await expect(conversationList).toBeVisible({ timeout: 15000 });

    // 3. Role-based deterministic assertions
    if (roleUnderTest === 'rh_agent') {
      await expect(page.getByRole('option', { name: /^TI$/ })).not.toBeVisible();
      await expect(page.getByRole('option', { name: /^Financeiro$/ })).not.toBeVisible();
    } else if (roleUnderTest === 'finance_agent') {
      await expect(page.getByRole('option', { name: /^Financeiro$/ })).toBeVisible();
      await expect(page.getByRole('option', { name: /^TI$/ })).not.toBeVisible();
    } else if (roleUnderTest === 'ti_admin' || roleUnderTest === 'transfer_agent') {
      await expect(page.getByRole('option', { name: /^TI$/ })).toBeVisible();
    }
  });

  test('Security: Direct Supabase Search/List bypass block (Soft-Deleted)', async ({ page }) => {
    // We use RH Agent to check if RLS blocks data leakage from other departments
    await loginAs(page, 'rh_agent');
    await page.waitForURL(/\/team-chat/, { waitUntil: 'networkidle' });

    const tiDeptId = 'd2222222-2222-2222-2222-222222222222';
    
    const securityCheck = await page.evaluate(async (deptId) => {
      const client = (window as any).supabase;
      
      // 1. Attempt to list messages from a conversation in another department directly
      const { data: listData } = await client
        .from('team_messages')
        .select('*')
        .eq('department_id', deptId); 

      // 2. Attempt to fetch soft-deleted messages explicitly (even in allowed depts)
      const { data: deletedData } = await client
        .from('team_messages')
        .select('*')
        .not('deleted_at', 'is', null);

      return { listCount: listData?.length || 0, deletedCount: deletedData?.length || 0 };
    }, tiDeptId);

    // Assert that RLS strictly returned nothing
    expect(securityCheck.listCount).toBe(0);
    expect(securityCheck.deletedCount).toBe(0);
  });

  test('Soft Delete: Admin enforcement and unauthorized recovery block', async ({ _page, browser }) => {
    // Use multi-context to simulate live interaction/isolation
    const adminContext = await browser.newContext();
    const agentContext = await browser.newContext();
    
    const adminPage = await adminContext.newPage();
    const agentPage = await agentContext.newPage();

    // STEP 1: Admin TI creates and soft-deletes a message
    await loginAs(adminPage, 'ti_admin');
    await adminPage.waitForURL(/\/team-chat/, { waitUntil: 'networkidle' });
    
    const sharedChannel = adminPage.getByRole('option', { name: /Geral/i });
    await sharedChannel.waitFor({ state: 'visible' });
    await sharedChannel.click();

    const uniqueMsgContent = `Governed-Security-Check-${Date.now()}`;
    
    // Inject and get ID
    const msgId = await adminPage.evaluate(async (content) => {
      const client = (window as any).supabase;
      const { data: conv } = await client.from('team_conversations').select('id').eq('name', 'Geral').single();
      const { data: profile } = await client.from('profiles').select('id').single();

      const { data: msg } = await client
        .from('team_messages')
        .insert({ conversation_id: conv.id, content, sender_id: profile.id })
        .select().single();
      return msg.id;
    }, uniqueMsgContent);

    // Ensure it shows up in UI
    await expect(adminPage.getByText(uniqueMsgContent)).toBeVisible();

    // Admin performs soft delete
    await adminPage.evaluate(async (id) => {
      await (window as any).supabase
        .from('team_messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
    }, msgId);

    // STEP 2: RH Agent (Unauthorized) attempt to access
    await loginAs(agentPage, 'rh_agent');
    await agentPage.waitForURL(/\/team-chat/, { waitUntil: 'networkidle' });
    await agentPage.getByRole('option', { name: /Geral/i }).click();

    // Verification: Not in UI
    await expect(agentPage.getByText(uniqueMsgContent)).not.toBeVisible({ timeout: 10000 });

    // Verification: RLS blocks direct fetch
    const directApiCheck = await agentPage.evaluate(async (id) => {
      const { data } = await (window as any).supabase
        .from('team_messages')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      return data;
    }, msgId);

    expect(directApiCheck).toBeNull();

    await Promise.all([adminContext.close(), agentContext.close()]);
  });

  test('Ticket Transfer: Metadata validation and visibility migration with consistency', async ({ _page, browser }) => {
    const supportContext = await browser.newContext();
    const financeContext = await browser.newContext();
    const tiContext = await browser.newContext();

    const supportPage = await supportContext.newPage();
    const financePage = await financeContext.newPage();
    const tiPage = await tiContext.newPage();

    // 1. Create content in Financeiro as Finance Agent
    await loginAs(financePage, 'finance_agent');
    await financePage.waitForURL(/\/team-chat/, { waitUntil: 'networkidle' });
    await financePage.getByRole('option', { name: /Financeiro/i }).click();
    
    const contextVerificationMsg = `Audit-Trail-${Date.now()}`;
    await financePage.evaluate(async (content) => {
      const client = (window as any).supabase;
      const { data: conv } = await client.from('team_conversations').select('id').eq('name', 'Financeiro').single();
      const { data: profile } = await client.from('profiles').select('id').single();
      await client.from('team_messages').insert({ conversation_id: conv.id, content, sender_id: profile.id });
    }, contextVerificationMsg);

    // 2. Support Agent transfers the conversation to TI
    await loginAs(supportPage, 'transfer_agent');
    await supportPage.waitForURL(/\/team-chat/, { waitUntil: 'networkidle' });

    const financeChannel = supportPage.getByRole('option', { name: /Financeiro/i });
    await expect(financeChannel).toBeVisible({ timeout: 15000 });
    await financeChannel.click();

    // Interaction flow
    await supportPage.getByRole('banner').getByLabel(/Mais ações/i).click();
    await supportPage.getByRole('menuitem', { name: /Transferir/i }).click();
    
    const select = supportPage.getByRole('combobox');
    await select.waitFor({ state: 'visible' });
    await select.click();
    
    const tiOption = supportPage.getByRole('option', { name: /^TI$/ });
    await tiOption.waitFor({ state: 'visible' });
    await tiOption.click();
    
    await supportPage.getByRole('button', { name: /Transferir/i }).click();
    await expect(supportPage.getByText(/Conversa transferida com sucesso/i)).toBeVisible();

    // 3. Validate Persistence & Isolation
    const backendAudit = await supportPage.evaluate(async () => {
      const client = (window as any).supabase;
      const { data: conv } = await client
        .from('team_conversations')
        .select('metadata, department_id, id')
        .eq('name', 'Financeiro')
        .single();
      
      const { data: msgs } = await client
        .from('team_messages')
        .select('content')
        .eq('conversation_id', conv.id);
        
      return { ...conv, msgs };
    });

    const tiDeptId = 'd2222222-2222-2222-2222-222222222222';
    expect(backendAudit.department_id).toBe(tiDeptId);
    expect(backendAudit.metadata).toHaveProperty('transferred_at');
    // Messages must persist after migration
    expect(backendAudit.msgs.map((m: any) => m.content)).toContain(contextVerificationMsg);

    // 4. Cross-User Visibility Check
    // Finance Agent must no longer see it
    await financePage.reload();
    await expect(financePage.getByRole('option', { name: /Financeiro/i })).not.toBeVisible({ timeout: 10000 });

    // TI Admin must now see it with content intact
    await loginAs(tiPage, 'ti_admin');
    await tiPage.waitForURL(/\/team-chat/, { waitUntil: 'networkidle' });
    await tiPage.getByRole('option', { name: /Financeiro/i }).click();
    await expect(tiPage.getByText(contextVerificationMsg)).toBeVisible();

    await Promise.all([supportContext.close(), financeContext.close(), tiContext.close()]);
  });
});
