import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const users = [
      { email: "admin_ti@zappweb.com", password: "ti123", role: "admin", department: "TI", name: "Admin TI", dept_id: "d2222222-2222-2222-2222-222222222222" },
      { email: "agent_rh@zappweb.com", password: "rh123", role: "agent", department: "RH", name: "Agente RH", dept_id: "d3333333-3333-3333-3333-333333333333" },
      { email: "agent_fin@zappweb.com", password: "fin123", role: "agent", department: "Financeiro", name: "Agente Financeiro", dept_id: "b2a0a820-14d3-4831-8916-8067aa0888dc" },
      { email: "agent_trans@zappweb.com", password: "trans123", role: "agent", department: "Suporte", name: "Agente Transferidor", dept_id: "d4444444-4444-4444-4444-444444444444" },
    ];

    const results = [];

    for (const user of users) {
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: { name: user.name }
      });

      let userId = authUser?.user?.id;

      if (authError) {
        if (authError.message.includes("already exists")) {
          // Find existing user_id
          const { data: profiles } = await supabase.from("profiles").select("user_id").eq("email", user.email).limit(1);
          userId = profiles?.[0]?.user_id;
        } else {
          results.push({ email: user.email, status: "error", error: authError.message });
          continue;
        }
      }

      if (!userId) {
        results.push({ email: user.email, status: "error", error: "Could not get user_id" });
        continue;
      }

      // Sync profile
      await supabase.from("profiles").upsert({
        user_id: userId,
        email: user.email,
        name: user.name,
        department: user.department,
        department_id: user.dept_id,
        role: user.role,
        is_active: true
      }, { onConflict: "user_id" });

      // Sync role
      await supabase.from("user_roles").upsert({
        user_id: userId,
        role: user.role
      }, { onConflict: "user_id,role" });

      results.push({ email: user.email, status: "success", userId });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
