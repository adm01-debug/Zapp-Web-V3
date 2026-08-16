/**
 * Lint rule: no-direct-evo-url (API oficial de plugins Deno 2.2+)
 *
 * Impede acesso direto a Deno.env.get('EVOLUTION_API_URL') fora do gateway
 * centralizado. Use evolutionClient de _shared/providers/evolution/client.ts.
 * ADR-009 — Gateway Pattern para Evolution API.
 */
export default {
  name: "no-direct-evo-url",
  rules: {
    "no-direct-evo-url": {
      create(context: any) {
        const isExempt = (rawPath: string) => {
          const filePath = rawPath.replace(/\\/g, "/");
          return (
            filePath.includes("providers/evolution") ||
            filePath.includes("evolution-api-proxy") ||
            filePath.includes(".test.ts") ||
            filePath.includes("__tests__")
          );
        };
        return {
          CallExpression(node: any) {
            const callee = node.callee;
            if (!callee || callee.type !== "MemberExpression") return;
            const arg0 = node.arguments && node.arguments[0];
            const val = arg0 && (arg0.value ?? null);
            if (val === "EVOLUTION_API_URL") {
              const fp = context.filename ?? "";
              if (!isExempt(fp)) {
                context.report({
                  node,
                  message:
                    "Use evolutionClient de _shared/providers/evolution/client.ts em vez de EVOLUTION_API_URL diretamente. (ADR-009)",
                });
              }
            }
          },
        };
      },
    },
  },
};
