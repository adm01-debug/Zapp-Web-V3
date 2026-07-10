import { parseOrReject } from "../contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";
Deno.test("probe", async () => {
  const r = parseOrReject("talkx-send", CONTRACT_SCHEMAS["talkx-send"], new Request("https://x/", {method:"POST"}), null);
  if (!r.ok) { const b = await r.response.json(); console.log("KEYS:", Object.keys(b).sort()); console.log("BODY:", b); }
});
