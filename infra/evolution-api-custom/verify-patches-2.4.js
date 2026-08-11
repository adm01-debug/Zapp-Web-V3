// verify-patches-2.4.js — verifica patches T1-T20 no bundle Evolution 2.4.0
// Arquivo separado para evitar escaping hell no Dockerfile RUN node -e
'use strict';
const fs = require('fs');
const s = fs.readFileSync('/evolution/dist/main.js', 'utf8');
const fail = (m) => { console.error('VERIFY FAIL: ' + m); process.exit(1); };
const ok   = (m) => console.log('  OK ' + m);

// T1: console.log antes de sendDataWebhook (tolerante — 2.4.0 usa logger)
if (s.includes('console.log(c),this.sendDataWebhook("messages.upsert",c)')) fail('T1 presente (esperado removido)');
ok('T1 ausente');

// T3: Sentry configurado corretamente
if (s.includes('tracesSampleRate:1,profilesSampleRate:1')) fail('T3 nao aplicado (Sentry original)');
if (!s.includes('tracesSampleRate:0.05')) fail('T3 marcador ausente');
ok('T3');

// T4: prologue MASKED
if (!s.includes('MASKED')) fail('T4 prologue MASKED ausente');
ok('T4');

// T6: versao mascarada
if (s.includes('version:lu.version,clientName:pu.CONNECTION.CLIENT_NAME')) fail('T6 nao aplicado (versao real presente)');
if (!s.includes('version:"2.x",clientName:pu.CONNECTION.CLIENT_NAME')) fail('T6 marcador ausente');
ok('T6');

// T7: CORS guard sem-Origin
if (!s.includes('!l||d.includes')) fail('T7 CORS guard ausente');
ok('T7');

// T8: guard MESSAGE_UPDATE no fluxo EDITED
if (!s.includes('SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:{fromMe:r.key.fromMe')) fail('T8 ausente');
ok('T8');

// T9: guard MESSAGE_UPDATE no deleteMessage logico
if (!s.includes('SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:a})')) fail('T9 ausente');
ok('T9');

// T10: guard MESSAGE_UPDATE no revoke DELETED
if (!s.includes('SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:d})')) fail('T10 ausente');
ok('T10');

// T11: instanceId no findFirst do deleteMessage
const t11marker = 'findFirst({where:{instanceId:this.instanceId,key:{path:["id"],equals:o}}})';
if (!s.includes(t11marker)) fail('T11 ausente');
ok('T11');

// T13a: S3 video continue (nao return)
const t13a = 'Skipping video upload.");continue}';
if (!s.includes(t13a)) fail('T13a ausente');
ok('T13a');

// T13b: S3 !media continue
const t13b = 'skipping MinIO");continue}';
if (!s.includes(t13b)) fail('T13b ausente');
ok('T13b');

// T14: chatName (nao pushName)
const t14 = '"Chat"."name" as "chatName",';
if (!s.includes(t14)) fail('T14 ausente');
ok('T14');

// T15: dedup upsert
if (!s.includes('let{pollUpdates:h,...m}=p,keyIdV')) fail('T15 dedup ausente');
ok('T15');

// T17/T19: remoteJidAlt via senderPn + lidMapping
if (!s.includes('senderPn')) fail('T19 senderPn ausente');
if (!s.includes('getPNForLID')) fail('T17/T19 lidMapping ausente');
ok('T17+T19');

// T20: cache TTL correto
if (!s.includes('msgRetryCounterCache=new wr.default({stdTTL:3600')) fail('T20 cache TTL ausente');
ok('T20');

console.log('VERIFY OK: main.js com T1-T20 aplicados (2.4.0)');
