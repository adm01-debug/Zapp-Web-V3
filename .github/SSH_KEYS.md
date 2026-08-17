# SSH Keys — GitHub Actions CI/CD

## Chave dedicada para E2E VPS

**Fingerprint:** `SHA256:GPzTcz5BuD9VaYjtCxeuPHTfGtbHUGKKuVTA7/p/+ds`  
**Algoritmo:** ED25519  
**Email:** `github-actions-zapp-ci@atomicabr.com.br`  
**Criada em:** 2026-08-01

### Chave pública (já instalada em `/root/.ssh/authorized_keys` da VPS)

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIspiMMbHeDLGaTt3+Ay9MgnLmYbOUmvqtMxnPkfVdQR github-actions-zapp-ci@atomicabr.com.br
```

### Secrets configurados no GitHub Actions

| Secret | Valor |
|--------|-------|
| `VPS_SSH_HOST` | `<VPS_SSH_HOST>` |
| `VPS_SSH_USER` | `<VPS_SSH_USER>` |
| `VPS_SSH_KEY` | chave privada ED25519 (secret) |

### Workflows que usam SSH

- `e2e-crm-vps.yml`
- `e2e-inbox-vps.yml`
- `cleanup-e2e-data.yml`
- `seed-e2e-contacts.yml`
- `seed-e2e-user.yml`
- `validate-e2e-user.yml`

### Usuário E2E

- **Email:** `qa-final@promobrindes.test`
- **Secrets:** `E2E_USER_EMAIL` + `E2E_USER_PASSWORD`
