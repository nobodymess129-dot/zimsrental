const fs = require('fs');
const c = fs.readFileSync('public/index.html', 'utf8');
const marker = '<script type="module">';
const i = c.indexOf(marker);
if (i < 0) { console.log('ERROR: marker not found'); process.exit(1); }
const s = i + marker.length;
const e = c.indexOf('</script>', s);
if (e < 0) { console.log('ERROR: end tag not found'); process.exit(1); }
const js = c.substring(s, e);
fs.writeFileSync('receipt-check.mjs', js);
<<<<<<< HEAD
console.log('Extracted ' + js.length + ' chars');
=======
console.log('Extracted ' + js.length + ' chars');
>>>>>>> f1c149432df4ec6e7b74410635c15c66885b8b7d
