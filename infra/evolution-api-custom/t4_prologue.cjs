// T4 prologue v2.5 — LGPD runtime mask | MARCADOR: MASKED
// v2.5: regex corrigidos para plain strings (multiline, end-of-string)
(function(){
  var R_KEY=/((?:api[_-]?key|x-api-key)["']?\s*[:=]?\s*["']?)([A-Za-z0-9_-]{8,})/gi;
  var R_CONV_Q=/(["'!]?conversation["'!]?\s*[:=]\s*)(["'!])([^\n]+?)\2/gi;
  var R_CONV_U=/(["'!]?conversation["'!]?\s*[:=]\s*)([^"'\n]+)$/gim;
  var R_PUSH_Q=/(["'!]?pushName["'!]?\s*[:=]\s*)(["'!])([^\n]+?)\2/gi;
  var R_PUSH_U=/(["'!]?pushName["'!]?\s*[:=]\s*)([^"'\n,}\]]+)$/gim;
  var R_AGENT=/(["'!]?agentId["'!]?\s*[:=]\s*)(["'!])([^\n]+?)\2/gi;
  var R_JID=/(["'!]?(?:remoteJid|userJid|jid)["'!]?\s*[:=]\s*["'!]?)(\d{4})\d+(@[^"'\s,}\]]+)/gi;
  var R_JID_P=/(\d{4})\d+(@(?:s\.whatsapp\.net|g\.us|lid))/gi;
  var S=function(v){try{return JSON.stringify(v)}catch(_){return null}};
  var m=function(s){
    R_KEY.lastIndex=0;s=s.replace(R_KEY,"$1***MASKED***");
    R_CONV_Q.lastIndex=0;s=s.replace(R_CONV_Q,"$1$2[MSG_MASKED]$2");
    R_CONV_U.lastIndex=0;s=s.replace(R_CONV_U,"$1[MSG_MASKED]");
    R_PUSH_Q.lastIndex=0;s=s.replace(R_PUSH_Q,"$1$2[NAME_MASKED]$2");
    R_PUSH_U.lastIndex=0;s=s.replace(R_PUSH_U,"$1[NAME_MASKED]");
    R_AGENT.lastIndex=0;s=s.replace(R_AGENT,"$1$2[AGENT_MASKED]$2");
    R_JID.lastIndex=0;s=s.replace(R_JID,"$1$2XXXX$3");
    R_JID_P.lastIndex=0;s=s.replace(R_JID_P,"$1XXXX$2");
    return s;
  };
  var mask=function(v){
    if(typeof v==="string")return m(v);
    if(v&&typeof v==="object"){
      if(v.key&&(v.message||v.messageStubType!==undefined))
        return "[WebMessageInfo:MASKED key="+(v.key&&v.key.id?v.key.id.substring(0,8)+"...":"?")+"]";
      var j=S(v);
      if(j&&(j.indexOf("conversation")>-1||j.indexOf("pushName")>-1||
             j.indexOf("@s.whatsapp.net")>-1||j.indexOf("@g.us")>-1||
             j.indexOf("remoteJid")>-1)){R_KEY.lastIndex=0;return m(j);}
      if(j){R_KEY.lastIndex=0;if(R_KEY.test(j)){R_KEY.lastIndex=0;return m(j);}}
    }
    return v;
  };
  ["log","error","warn","info","debug"].forEach(function(k){
    var o=console[k].bind(console);
    console[k]=function(){
      var a=Array.prototype.slice.call(arguments);
      o.apply(null,a.map(mask));
    };
  });
})();