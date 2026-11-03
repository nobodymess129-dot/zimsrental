// Zims Rental Cars Nadi - Phase 4, Edit 8 (initial render() call)
const fs = require('fs');
const path = require('path');
const filePath = path.join(process.cwd(), 'public', 'fleet.html');
console.log('');
console.log('===================================================');
console.log(' Zims Phase 4, Edit 8 - Initial render() call');
console.log('===================================================');
console.log('');
console.log('[1/6] Verifying file exists...');
if (!fs.existsSync(filePath)) { console.error('  ERROR: File not found at: ' + filePath); process.exit(1); }
console.log('  OK: ' + filePath);
console.log('[2/6] Creating backup...');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = filePath + '.bak-' + timestamp;
fs.copyFileSync(filePath, backupPath);
console.log('  Backup: ' + backupPath);
console.log('[3/6] Reading file...');
const rawBytes = fs.readFileSync(filePath);
const hasBom = rawBytes.length >= 3 && rawBytes[0] === 0xEF && rawBytes[1] === 0xBB && rawBytes[2] === 0xBF;
let content = hasBom ? rawBytes.slice(3).toString('utf8') : rawBytes.toString('utf8');
const hasCrlf = content.includes('\r\n');
let norm = content.replace(/\r\n/g, '\n');
const search = 'loadPublishedFleet();';
const replace = 'render();loadPublishedFleet();';
console.log('[4/6] Verifying and applying edit...');
let count = 0, startAt = 0;
while (true) { const found = norm.indexOf(search, startAt); if (found < 0) break; count++; startAt = found + 1; }
if (count === 0) { console.log('  NOT FOUND'); console.log('  Aborting. Restoring from backup...'); fs.copyFileSync(backupPath, filePath); console.log('  Restored.'); process.exit(1); }
if (count > 1) { console.log('  FOUND ' + count + ' TIMES (expected 1)'); console.log('  Aborting. Restoring from backup...'); fs.copyFileSync(backupPath, filePath); console.log('  Restored.'); process.exit(1); }
norm = norm.replace(search, replace);
console.log('  OK (applied exactly once)');
console.log('[5/6] Writing file back...');
norm = norm.replace(/\r\n/g, '\n');
if (hasCrlf) { norm = norm.replace(/\n/g, '\r\n'); }
const utf8Bytes = Buffer.from(norm, 'utf8');
let finalBytes;
if (hasBom) { finalBytes = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), utf8Bytes]); } else { finalBytes = utf8Bytes; }
fs.writeFileSync(filePath, finalBytes);
console.log('  File written.');
console.log('[6/6] Verification:');
const hasRender = norm.includes('render();loadPublishedFleet();');
console.log('  Initial render() call present: ' + (hasRender ? 'YES' : 'NO'));
const lines = norm.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) { if (lines[i].includes('render();loadPublishedFleet();')) { console.log('  Line ' + (i + 1) + ': ' + lines[i]); } }
console.log('');
console.log('  Summary:');
console.log('  Edit applied: 1 of 1');
console.log('  Backup file:  ' + backupPath);
console.log('  File size:    ' + finalBytes.length + ' bytes (was ' + rawBytes.length + ', diff ' + (finalBytes.length - rawBytes.length) + ')');
console.log('');
console.log('  NEXT STEPS:');
console.log('   1. Paste back: edit applied, line number, file size diff');
console.log('   2. After I confirm, run:  npm test');
console.log('   3. Then run:  npm run dev  and visit http://localhost:8787/fleet');
console.log('      The fleet grid should show 7 vehicles immediately on page load,');
console.log('      even before the API call completes.');
console.log('');
