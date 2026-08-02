# ADR-005: Implementação de PWA e fila offline

**Data:** 2026-08-02
**Status:** Decidido
**Decisor:** Abner (Joaquim)

## Contexto

O código atual tem uma situação inconsistente com PWA/offline:
- `src/lib/offlineQueue.ts` (226 linhas) — fila offline completa, **zero consumidores**
- `public/sw.js:141-143` — `sendQueuedMessages()` é stub (`console.log`)
- `index.html:74` — script `recoverPreview()` **desregistra todos os Service Workers** a cada sessão
- `vite-plugin-pwa` está instalado mas nunca configurado
- 4 specs testam a **ausência** de workbox (sugerindo que a remoção já foi iniciada)

Duas hipóteses: (a) o PWA foi abandonado silenciosamente; (b) foi iniciado e nunca terminado.

## Decisão

**Implementar PWA e fila offline de verdade.**

Isso significa:
1. Corrigir o `index.html` para NÃO desregistrar SWs automaticamente
2. Implementar `sendQueuedMessages()` no Service Worker (substituir o stub)
3. Conectar a fila offline (`offlineQueue.ts`) aos consumidores reais
4. Configurar `vite-plugin-pwa` corretamente (Workbox, estratégia de cache)
5. Remover as specs que testam a ausência de workbox

## Consequências

- ✅ Fecha os achados: **F9-01, F9-02, F9-03, F10-03**
- ⚠️ Aumenta o escopo da Etapa 15 (Inbox) e Etapa 18 (Admin)
- 🔧 Exige nova Etapa: PWA/offline (pode ser incorporada na Etapa 15)

## Achados resolvidos por esta decisão

| Achado | Status |
|--------|--------|
| F9-01 | MOVER PARA ETAPA DE IMPLEMENTAÇÃO — conectar offlineQueue.ts |
| F9-02 | MOVER PARA ETAPA DE IMPLEMENTAÇÃO — implementar sendQueuedMessages() |
| F9-03 | MOVER PARA ETAPA DE IMPLEMENTAÇÃO — parar de desregistrar SW |
| F10-03 | MOVER PARA ETAPA DE IMPLEMENTAÇÃO — configurar vite-plugin-pwa |
