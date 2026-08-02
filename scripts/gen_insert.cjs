const fs = require('fs');
const hex = fs.readFileSync('lgpd_src.hex', 'utf8');
const chunkSize = 6000;
const lines = [];
for (let i = 0; i < hex.length; i += chunkSize) {
  const chunk = hex.slice(i, i + chunkSize);
  lines.push(`  (${Math.floor(i/chunkSize)}, E'${chunk}')`);
}
const sql = `INSERT INTO zapp._lgpd_payload (id, chunk) VALUES\n${lines.join(',\n')};`;
fs.writeFileSync('lgpd_insert.sql', sql);
console.log('SQL file size=' + sql.length + ' chunks=' + lines.length);
