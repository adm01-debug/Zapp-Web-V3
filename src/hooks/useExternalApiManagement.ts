// @ts-nocheck
/**
 * useExternalApiManagement
 *
 * Consolidated module for external CRM database integration.
 * Combines 9 previously separate external API hooks into one unified module.
 *
 * Sections:
 *   1. Contact 360 Data (useExternalContact360, useExternalContact360Batch)
 *   2. Contact Metadata (useExternalCargos, useExternalEmpresas)
 *   3. Evolution/Conversations (useExternalConversations, useExternalMessages)
 *   4. Catalog & Products (useExternalCatalog)
 *   5. Generic External DB (useExternalSelect, useExternalRPC, useExternalTableBrowser, useExternalMutation)
 *
 * 2026-07-26: useExternalMessages aceita instanceName opcional para suporte multi-instancia.
 *   - Antes: hardcodado em DEFAULT_INSTANCE (wpp2)
 *   - Depois: deriva da conversa selecionada via useInboxSource
 *   - Backwards compatible: callers sem instanceName continuam funcionando
 */
