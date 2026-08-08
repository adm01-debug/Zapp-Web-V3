// T4 prologue v2 — runtime console mask (build-time, dist/main.js prepend)
// v1: mascarava apikey/x-api-key strings e objetos
// v2 (2026-08-08, etapa-91): tambem mascara PII de mensagens WhatsApp:
//   - conversation (conteudo de texto)
//   - pushName (nome do contato)
//   - remoteJid (numero de telefone — mantido prefixo para debug)
//   - agentId (UUID de agente)
//   - Objetos WebMessageInfo completos (serializa e redige)
//
// LGPD: zero conteudo de mensagem em docker logs / Sentry / coletores.
(function(){
  // --- Regex patterns ---
  // apikey (T4 v1)
  const R_KEY=/((?:api[_-]?key|x-api-key)["']?\s*[:=]?\s*["']?)([A-Za-z0-9_-]{8,})/gi;
  // Conteudo de mensagem (conversation field)
  const R_CONV=/(\"conversation\"\s*:\s*\")[^\"]*/gi;
  // pushName / agentId
  const R_PUSH=/("pushName"\s*:\s*")([^"]*?)"/gi;
  const R_AGENT=/("agentId"\s*:\s*")([^"]*?)"/gi;
  // remoteJid: manter os primeiros 4 digitos para debug routing
  const R_JID=/("(?:remoteJid|userJid|jid)"\s*:\s*")(\d{4})\d+(@[^"]+)"/gi;
  // Numero de telefone em strings planas (55XXXXXXXXXXX@s.whatsapp.net)
  const R_JID_PLAIN=/(\d{4})\d+(@(?:s\.whatsapp\.net|g\.us|lid))/gi;

  const S=function(v){try{return JSON.stringify(v)}catch(_){return null}};

  const mask=function(v){
    if(typeof v==='string'){
      let s=v;
      R_KEY.lastIndex=0; s=s.replace(R_KEY,'$1***MASKED***');
      R_CONV.lastIndex=0; s=s.replace(R_CONV,'$1[MSG_MASKED]"');
      R_PUSH.lastIndex=0; s=s.replace(R_PUSH,'$1[NAME_MASKED]"');
      R_AGENT.lastIndex=0; s=s.replace(R_AGENT,'$1[AGENT_MASKED]"');
      R_JID.lastIndex=0; s=s.replace(R_JID,'$1$2XXXX$3"');
      R_JID_PLAIN.lastIndex=0; s=s.replace(R_JID_PLAIN,'$1XXXX$2');
      return s;
    }
    if(v&&typeof v==='object'){
      // WebMessageInfo detectado pelo shape (key + message ou messageStubType)
      if(v.key&&(v.message||v.messageStubType!==undefined)){
        return '[WebMessageInfo:MASKED key='+
          (v.key&&v.key.id?v.key.id.substring(0,8)+'...':'?')+']';
      }
      const j=S(v);
      if(j){
        R_KEY.lastIndex=0;
        if(R_KEY.test(j)||j.indexOf('"conversation"')>-1||
           j.indexOf('"pushName"')>-1||j.indexOf('@s.whatsapp.net')>-1||j.indexOf('@g.us')>-1||j.indexOf('"remoteJid"')>-1){
          // Objeto com PII - re-mascarar serializado
          let s=j;
          R_KEY.lastIndex=0; s=s.replace(R_KEY,'$1***MASKED***');
          R_CONV.lastIndex=0; s=s.replace(R_CONV,'$1[MSG_MASKED]"');
          R_PUSH.lastIndex=0; s=s.replace(R_PUSH,'$1[NAME_MASKED]"');
          R_AGENT.lastIndex=0; s=s.replace(R_AGENT,'$1[AGENT_MASKED]"');
          R_JID.lastIndex=0; s=s.replace(R_JID,'$1$2XXXX$3"');
          R_JID_PLAIN.lastIndex=0; s=s.replace(R_JID_PLAIN,'$1XXXX$2');
          return s;
        }
      }
    }
    return v;
  };

  ['log','error','warn','info','debug'].forEach(function(k){
    const o=console[k].bind(console);
    console[k]=function(){
      const a=Array.prototype.slice.call(arguments);
      o.apply(null,a.map(mask));
    };
  });
})();
