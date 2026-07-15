# 🚀 Onboarding: Bem-vindo ao ZAPP WEB

Este guia ajudará você a configurar seu ambiente e começar a contribuir em menos de 1 hora.

## 🛠️ Setup do Ambiente
1. **Node.js**: Use v20+ (recomendado via `nvm`).
2. **Package Manager**: Usamos `bun` para performance.
3. **Extensões VS Code**: ESLint, Prettier, Tailwind CSS IntelliSense.

## 📦 Instalação
```bash
bun install
cp .env.example .env.local
bun run dev
```

## 🏗️ Arquitetura Core
- **Frontend**: React + Vite + shadcn/ui.
- **Backend**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`.
  - Veja [docs/SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md) para detalhes.
  - **FATOR X**: Domínio de WhatsApp/CRM (via `externalClient`).
- **Comunicação**: Sempre prefira RPCs (`SECURITY DEFINER`) para o FATOR X.

## 🧪 Qualidade de Código
- **Tipagem**: Mantenha `strict` e evite `any`.
- **Validação**: Use schemas **Zod** em `src/schemas/`.
- **Logs**: Nunca use `console.log`. Use `import { log } from '@/lib/logger'`.
- **Testes**: Rode `bun run test` antes de enviar PRs.

## 🚀 Fluxo de Trabalho
1. Crie uma branch `feature/nome-da-feature`.
2. Siga o template de Pull Request.
3. Aguarde o CI passar (Lint, Typecheck, Tests, E2E).

Dúvidas? Consulte o canal `#dev` no Slack.
