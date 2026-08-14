// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

import tailwind from "eslint-plugin-tailwindcss";

export default tseslint.config(
  // `.eslintrc.tailwind.js` is an orphaned legacy config (never wired into this
  // flat config) that holds TypeScript syntax in a .js file, so it fails to
  // parse. Ignore it here instead of surfacing a spurious parse error.
  { ignores: ["dist", "supabase/functions/**", ".eslintrc.tailwind.js", ".hermes/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      // Tailwind specific rules removed due to environment constraints
      // Estratégia gradual de strict typing
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-expect-error": "allow-with-description",
          "ts-nocheck": false,
        },
      ],
    },
    settings: {
      tailwindcss: {
        callees: ["cn", "cva", "clsx"],
        config: "tailwind.config.js",
      },
    },
  },
  // shadcn/ui vendor files and test mocks legitimately export multiple values per
  // file (components + sub-components + hooks + types). The react-refresh rule
  // only matters for HMR fast-refresh correctness on *app* components, not for
  // library-style files.
  {
    files: [
      "src/components/ui/**/*.{ts,tsx}",
      "src/test/**/*.{ts,tsx}",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // DOMAIN BOUNDARY ENFORCEMENT — Bloqueia importações diretas entre domínios.
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            {
              "group": ["@/features/*/**", "src/features/*/**", "@/admin/**", "@/auth/**", "@/connections/**", "@/inbox/**", "@/sla/**"],
              "message": "Domain violation: Access other features only through their main entry point (@/features/name). Internal details should remain encapsulated."
            }
          ]
        }
      ]
    }
  },
  // Stricter checks for test files: forbid `any` and force explicit typing.
  // `no-non-null-assertion` is turned off for tests: `!` assertions are idiomatic
  // in test helpers (RTL queries, mock data access) and don't run in production.
  {
    files: [
      "src/**/__tests__/**/*.{ts,tsx}",
      "src/**/*.test.{ts,tsx}",
      "src/**/*.spec.{ts,tsx}",
      "src/test/**/*.{ts,tsx}",
      "src/tests/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  // Allow console in e2e tests and scripts
  {
    files: [
      "e2e/**/*.{ts,tsx}",
      "scripts/**/*.{ts,tsx}",
      "tests/**/*.{ts,tsx}",
    ],
    rules: {
      "no-console": "off",
    },
  },
  // INBOX READ CONTRACT — bloqueia leitura via Evolution API dentro do inbox.
  {
    files: [
      "src/components/inbox/**/*.{ts,tsx}",
      "src/hooks/inbox/**/*.{ts,tsx}",
      "src/pages/Inbox*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            {
              "group": ["**/features/*/**"],
              "message": "Use direct feature entry points or internal aliases. Avoid deep imports across features."
            },
            {
              "group": ["../../*", "../../../*"],
              "message": "Use '@/features/...' aliases instead of deep relative paths."
            },
            {
              "group": [
                "**/evolution-api/**/find*",
                "**/evolution-api/**/list-messages*",
                "**/evolution-api/**/find-messages*",
                "**/evolution-api/**/find-chats*"
              ],
              "message":
                "Inbox lê do Evolution DB (schema evo) via Supabase direto. Não consulte Evolution API para popular UI. Para envio, use externalMessageSender (src/features/inbox/hooks/realtime/externalMessageSender.ts)."
            }
          ]
        }
      ],
    },
  },
  // STRICT ZONE — código novo / já migrado.
  {
    files: [
      "src/lib/runtimeGuards.ts",
      "src/lib/externalProxy.ts",
      "src/lib/evolutionCircuitBreaker.ts",
      "src/lib/evolutionSendRetry.ts",
      "src/test/typing.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],
    },
  },
  ...storybook.configs["flat/recommended"],
  // REALTIME HYGIENE / ANTI-REGRESSION GUARDS (ChatPanel fixes E01-E20) — E20
  // Previne reintrodução dos bugs corrigidos na auditoria 2026-07-30.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/constants/whatsappInstances.ts",
      "src/services/api/queryKeys.ts",
      "src/integrations/supabase/client.ts",
      "src/features/inbox/hooks/realtime/externalSenderTypes.ts",
      "src/integrations/zappweb/evolutionClient.ts",
      "src/lib/whatsappAdapter.ts",
      "src/**/__tests__/**",
      "src/**/*.test.{ts,tsx}",
      "src/**/*.spec.{ts,tsx}",
      "scripts/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // E03/E07: instância hardcoded quebra roteamento multi-instância
          selector: "Literal[value='wpp2']",
          message:
            "E20: Instância WhatsApp hardcoded. Use instanceName da conversa ou DEFAULT_WHATSAPP_INSTANCE. Ver CONTACTREF.md.",
        },
        {
          // E05: canal Realtime estático causa colisão cross-conversa
          selector:
            "CallExpression[callee.property.name='channel'] > TemplateLiteral[expressions.length=0]",
          message:
            "E20: Canal Realtime com nome fixo causa colisão de tópico. Inclua o remote_jid: `chat-updates:${contactJid}`.",
        },
      ],
    },
  },
  // Supabase types SEMPRE via barrel canônico (@/integrations/supabase/schema) —
  // aplica-se a todos os arquivos src incluindo testes. Bloco separado para não
  // herdar os ignores de test files do bloco SCHEMA CONTRACT GUARDS abaixo.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/integrations/supabase/types.ts",
      "src/integrations/supabase/types-manual.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/integrations/supabase/types",
              message:
                "Importar de '@/integrations/supabase/schema' (barrel canônico). types.ts é auto-gerado e pode mudar.",
            },
            {
              name: "@/integrations/supabase/types-manual",
              message:
                "Importar de '@/integrations/supabase/schema' (barrel canônico). types-manual.ts é detalhe de implementação interno.",
            },
          ],
        },
      ],
    },
  },
  // DECOUPLE GUARDS (E94 Plano V2) — impede regresso do acoplamento Evolution
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/whatsappAdapter.ts",
      "src/lib/sendFunctionRouter.ts",
      "src/**/__tests__/**",
      "src/**/*.test.{ts,tsx}",
      "src/**/*.spec.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          // Proíbe invoke('evolution-api', ...) fora do whatsappAdapter
          selector:
            "CallExpression[callee.property.name='invoke'][arguments.0.value='evolution-api']",
          message:
            "[decouple] invoke('evolution-api') direto — usar whatsappAdapter (E94 Plano V2). https://github.com/adm01-debug/zapp-web-v3/blob/main/docs/decouple/PLANO_DESACOPLAMENTO_V2_100_ETAPAS.md",
        },
        {
          // Proíbe import de evolutionExternal fora de src/adapters
          selector:
            "ImportDeclaration[source.value=/evolutionExternal/]",
          message:
            "[decouple] Import de evolutionExternal só permitido em src/adapters/ (E94 Plano V2).",
        },
      ],
    },
  },
  // SCHEMA CONTRACT GUARDS — o front só acessa views/tabelas do schema 'zapp'
  // (client com db.schema='zapp'). Acessos diretos a schemas físicos ('evo' /
  // 'email_app') ou ao 'public' quebram o contrato single-DB e devem ser
  // substituídos por views em zapp.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/integrations/supabase/types.ts",
      "src/integrations/supabase/types-manual.ts",
      "src/integrations/supabase/client.ts",
      "src/**/__tests__/**",
      "src/**/*.test.{ts,tsx}",
      "src/**/*.spec.{ts,tsx}",
      "scripts/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // .schema('evo') / .schema('email_app') — usar views zapp.
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='schema'][arguments.0.value=/^(evo|email_app)$/]",
          message:
            "Não usar .schema('evo'|'email_app') no front — usar views zapp (contrato single-DB).",
        },
        {
          // schema:'public' em objetos (ex.: postgres_changes) — views não
          // emitem WAL, mas o contrato de leitura é sempre zapp.
          selector: "Property[key.name='schema'][value.value='public']",
          message:
            "Não usar schema:'public' no front — usar views zapp (contrato single-DB).",
        },
        {
          // information_schema — não acessar diretamente (PGRST_DB_SCHEMAS não inclui
          // information_schema; além disso, consultas diretas expõem metadados sensíveis
          // do banco). Usar RPCs: rpc_schema_tables / rpc_schema_columns.
          selector: "Literal[value='information_schema']",
          message:
            "Não acessar information_schema diretamente — usar RPCs rpc_schema_tables/rpc_schema_columns (F-06).",
        },
      ],
    },
  },
);
