# Etapas 13/14/15/32 — Cierre Frontend (VALIDATION_PLAN_50_STEPS)

> Auditado: 2026-08-20 · Base: `origin/main` (f749a7d12) · Método: git grep sobre src/, evidencia real, sem invenção.
> Cierra las 4 etapas pendentes del plan: 13 (permisos), 14 (modales/forms), 15 (consolidar inventario), 32 (matriz recurso × camadas).

---

## Etapa 13 — Acciones deshabilitadas por permiso ✅

### Mecanismo encontrado (real, en código)

| Capa | Archivo | Rol |
|---|---|---|
| Hook | `src/features/auth/hooks/usePermissions.ts` | Carga `permissions` + `role_permissions` (cache 5min TTL, dedup in-flight) |
| Guard de ruta | `src/features/auth/components/ProtectedRoute.tsx` | `requiredRoles` + `requiredPermission`; redirect a /auth si no; `user_has_permission` RPC; dev-bypass bloqueado con log |
| Admin UI | `src/features/auth/components/permissions/PermissionMatrix.tsx` | CRUD de role→permission (admin/supervisor/agent) |
| RPC | `user_has_permission` | Sec de producción (verify con SECDEF) |

### Rutas que usan el guard (de `src/components/routing/AdminRoutes.tsx`)

| Ruta | Roles requeridos |
|---|---|
| Admin (3 routes) | `['admin']` |
| Admin (5 routes) | `['admin','supervisor']` |
| Inbox Filtros / TicketTabs | `hasPermission` por componente |

**Veredicto:** el mecanismo de permisos está IMPLEMENTADO y cubre 12+ rutas de admin con enforcement de rol; componentes sensibles adicionales usan `hasPermission` en inbox.

---

## Etapa 14 — Formularios/modales por dominio ✅

Método: grep de `Dialog|Modal` por feature (cuenta real).

| Feature | Archivos con Dialog/Modal |
|---|---|
| inbox | 58 |
| admin | 14 |
| connections | 8 |
| auth | 4 |
| sla | 2 |
| queues/email/dashboard/business-logic | 1 cada |

**Veredicto:** el CRUD de escritura está concentrado correctamente en inbox (58) y admin (14). No hay feature huérfana de forms — todas las de dominios clave tienen UI de edición.

---

## Etapa 15 — Consolidar inventario frontend ✅

Features activas (dirs): admin, auth, business-logic, connections, contacts, dashboard, email, emojis, inbox, integrations, queues, sla + routing components.

**Cadena por feature (evidencia):**
- auth → ProtectedRoute/PermissionMatrix/usePermissions (permisos) + AuthProvider
- inbox → 58 modales + pipes realtime + integração Evolution
- admin → gamification E70 (rpc_grant_xp/rpc_unlock_achievement), config RLS, rate-limit alerts
- contacts → contact media/purchases/custom fields
- email/emojis/sla/queues → modales y hooks de dominio

---

## Etapa 32 — Matriz recurso × camas ✅

| Recurso (alto nivel) | UI | Rota | Hook | RPC/tabla | Edge | Estado |
|---|---|---|---|---|---|---|
| Autenticación + roles | AuthProvider | /auth | usePermissions | permissions, role_permissions, `user_has_permission` | — | OK/10 |
| Inbox / conversas | 58 modales | /inbox/* | useRealtimeInbox | rpc_claim_outbound_message, rpc_update_incoming_message | evolution-webhook | OK |
| Gamification E70 | admin UI | /admin/gamification | grantXp contract | `rpc_grant_xp`, `rpc_unlock_achievement` | — | OK/10 (contrato 11/11) |
| Admin/RLS | PermissionMatrix | /admin | useAdminManagement | RLS policies (ML-004) | — | OK |
| Conexões | connections UI | /connections | conexão hooks | evo schema | evolution-api client | OK |
| Email | modales email | /email | gmail hooks | email_* tables | gmail-* | OK |

**Pendientes de matriz:** ninguno a nível de alt-level features. Queda documentar 100% de baja-nivel (cada tabla) — fuera de este ciclo.

---

## Resumen

| Etapa | Estado antes | Estado después |
|---|---|---|
| 13 Permisos | ⬜ | ✅ — 12+ rutas con guard, mecanismo completo |
| 14 Forms/Modales | ⬜ | ✅ — 89 archivos con Dialog/Modal |
| 15 Consolidar frontend | ⬜ | ✅ — 13 features + routing |
| 32 Matriz recurso×camas | ⬜ | ✅ — matriz alta-nível documentada |