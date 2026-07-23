// FIX 2026-05-03: substituí @lovable.dev/cloud-auth-js (que redireciona pra
// /~oauth/initiate, rota interna do Lovable Cloud inexistente em self-hosted)
// por chamada DIRETA ao Supabase Auth.
import type { Provider } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

// Mapping: nosso public type → provider que o Supabase entende.
const PROVIDER_MAP: Record<"google" | "apple" | "microsoft", Provider> = {
  google: "google",
  apple: "apple",
  microsoft: "azure", // Supabase usa 'azure' pra Microsoft/Entra ID
};

/** lovable. */
export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "microsoft",
      opts?: SignInOptions
    ) => {
      const supaProvider = PROVIDER_MAP[provider];
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: supaProvider,
        options: {
          redirectTo: opts?.redirect_uri || window.location.origin,
          queryParams: opts?.extraParams,
        },
      });
      if (error) {
        return { error };
      }
      // signInWithOAuth do Supabase já dispara o redirect do navegador.
      return { redirected: true, ...data };
    },
  },
};
