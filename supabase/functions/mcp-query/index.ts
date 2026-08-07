const SECRET = "zappweb_mcp_cY7xK9pQ2mNvR4tL";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-mcp-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.headers.get("x-mcp-secret") !== SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const { sql, limit = 100 } = await req.json();
  const sqlUpper = (sql || "").toUpperCase().trim();
  if (/\b(DROP|TRUNCATE)\b/.test(sqlUpper)) {
    return new Response(JSON.stringify({ error: "Query destrutiva bloqueada" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const finalSql = /\blimit\b/i.test(sql) ? sql : `${sql} LIMIT ${limit}`;
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "apikey": key,
    },
    body: JSON.stringify({ query: finalSql }),
  });
  const data = await res.json();
  if (!res.ok) {
    return new Response(JSON.stringify({ error: data }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const rows = Array.isArray(data) ? data : [data];
  return new Response(JSON.stringify({ rows, count: rows.length }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
