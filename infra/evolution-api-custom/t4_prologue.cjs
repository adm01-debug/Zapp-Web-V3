// T4 prologue — runtime console mask para api_key/apikey/x-api-key (strings E objetos)
// Externalizado como docker config 2026-07-06 (evita interpolacao do compose-parser no stack file).
// Regex validada em 8 cenarios adversariais. Prepended a dist/main.js pelo logpatch.cjs.
(function(){
  const R=/((?:api[_-]?key|x-api-key)["']?\s*[:=]?\s*["']?)([A-Za-z0-9_-]{8,})/gi;
  const S=function(v){try{return JSON.stringify(v)}catch(_){return null}};
  const m=function(v){
    if(typeof v==='string'){R.lastIndex=0;return v.replace(R,'$1***MASKED***')}
    if(v&&typeof v==='object'){const j=S(v);if(j){R.lastIndex=0;if(R.test(j)){R.lastIndex=0;return j.replace(R,'$1***MASKED***')}}}
    return v
  };
  ['log','error','warn','info','debug'].forEach(function(k){
    const o=console[k].bind(console);
    console[k]=function(){const a=Array.prototype.slice.call(arguments);o.apply(null,a.map(m))}
  })
})();
