// Zims Rental Cars Nadi - Phase 10, Booking Receipt Feature
// Adds: receipt modal, PNG/PDF download, auto-show after booking, download button in lookup
const fs = require('fs');
const path = require('path');
const filePath = path.join(process.cwd(), 'public', 'index.html');
console.log('');
console.log('===================================================');
console.log(' Zims Booking Receipt Feature (PNG + PDF download)');
console.log('===================================================');
console.log('');
console.log('[1/8] Verifying file exists...');
if (!fs.existsSync(filePath)) { console.error('  ERROR: File not found at: ' + filePath); process.exit(1); }
console.log('  OK: ' + filePath);
console.log('[2/8] Creating backup...');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = filePath + '.bak-' + timestamp;
fs.copyFileSync(filePath, backupPath);
console.log('  Backup: ' + backupPath);
console.log('[3/8] Reading file...');
const rawBytes = fs.readFileSync(filePath);
const hasBom = rawBytes.length >= 3 && rawBytes[0] === 0xEF && rawBytes[1] === 0xBB && rawBytes[2] === 0xBF;
let content = hasBom ? rawBytes.slice(3).toString('utf8') : rawBytes.toString('utf8');
const hasCrlf = content.includes('\r\n');
let norm = content.replace(/\r\n/g, '\n');

// === EDIT A: Add CDN scripts for html2canvas and jsPDF before </head> ===
const searchA = '</head>';
const replaceA = '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" defer></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" defer></script>\n</head>';
let cntA = 0, idxA = 0;
while ((idxA = norm.indexOf(searchA, idxA)) >= 0) { cntA++; idxA++; }
if (cntA !== 1) { console.log('  Edit A: FAILED (' + cntA + ' matches for </head>)'); fs.copyFileSync(backupPath, filePath); process.exit(1); }
norm = norm.replace(searchA, () => replaceA);
console.log('  Edit A (CDN scripts): OK');

// === EDIT B: Add receipt CSS before </style> ===
const searchB = '</style>';
const receiptCSS = `
/* Booking receipt styles */
.receipt-modal-bg{position:fixed;inset:0;background:rgba(10,40,80,.55);z-index:200;display:none;align-items:flex-start;justify-content:center;padding:20px 14px;overflow-y:auto}
.receipt-modal-bg.show{display:flex}
.receipt-modal{background:#fff;border-radius:14px;max-width:520px;width:100%;margin:auto;box-shadow:0 14px 50px rgba(10,40,80,.25);overflow:hidden}
.receipt-modal-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e0e6ed}
.receipt-modal-head .kicker{font:700 11px Manrope;text-transform:uppercase;letter-spacing:1px;color:#5a6c7d}
.receipt-modal-head h2{margin:2px 0 0;font:800 18px Manrope;color:#0a3d62}
.receipt-modal-head .close{background:none;border:0;font-size:24px;line-height:1;color:#5a6c7d;cursor:pointer;padding:4px 8px;border-radius:6px}
.receipt-modal-head .close:hover{background:#f0f4f8}
.receipt-body{padding:0;max-height:60vh;overflow-y:auto}
.receipt{background:#fff;color:#1a2b3c;font-family:Manrope,sans-serif;padding:18px 20px}
.receipt-header{text-align:center;padding-bottom:12px;border-bottom:2px solid #d5e7f5;margin-bottom:12px}
.receipt-header h3{margin:0;font:800 18px Manrope;color:#0a3d62}
.receipt-subtitle{margin:4px 0 0;font:700 11px Manrope;color:#5a6c7d;text-transform:uppercase;letter-spacing:1.2px}
.receipt-section{margin-bottom:14px}
.receipt-section h4{margin:0 0 8px;font:700 12px Manrope;color:#0a3d62;text-transform:uppercase;letter-spacing:.5px}
.receipt-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin:5px 0;font:500 13px Manrope}
.receipt-label{color:#5a6c7d;flex-shrink:0}
.receipt-value{color:#1a2b3c;font-weight:600;text-align:right;word-break:break-word}
.receipt-ref{font-family:monospace;font-weight:700;color:#0a3d62;font-size:12px}
.receipt-discount{color:#c0392b}
.receipt-total{font-weight:800;font-size:14px;color:#0a3d62}
.receipt-divider{height:1px;background:#e0e6ed;margin:8px 0}
.receipt-note{background:#fff8e1;border-left:3px solid #f39c12;padding:8px 12px;margin:8px 0;font:500 12px Manrope;color:#5d4e1a;border-radius:0 6px 6px 0}
.receipt-note-paid{background:#e8f5e9;border-left-color:#27ae60;color:#1b5e20}
.receipt-steps{margin:0;padding-left:18px;font:500 12px Manrope;color:#1a2b3c}
.receipt-steps li{margin:4px 0}
.receipt-footer{text-align:center;padding-top:12px;border-top:1px solid #e0e6ed;font:500 11px Manrope;color:#5a6c7d}
.receipt-footer a{color:#0a3d62;text-decoration:none}
.receipt-footer p{margin:3px 0}
.receipt-instructions{font:500 12px Manrope;color:#1a2b3c;background:#f8fafd;padding:10px 12px;border-radius:6px;border:1px solid #e0e6ed}
.receipt-instructions p{margin:4px 0}
.receipt-instructions strong{color:#0a3d62}
.receipt-actions{display:flex;gap:8px;flex-wrap:wrap;padding:14px 20px;border-top:1px solid #e0e6ed;background:#f8fafd}
.receipt-actions button{flex:1;min-width:130px}
@media(max-width:520px){.receipt-actions{flex-direction:column}.receipt-actions button{min-width:100%}}
</style>`;
const replaceB = receiptCSS + '\n' + searchB;
let cntB = 0, idxB = 0;
while ((idxB = norm.indexOf(searchB, idxB)) >= 0) { cntB++; idxB++; }
if (cntB !== 1) { console.log('  Edit B: FAILED (' + cntB + ' matches for </style>)'); fs.copyFileSync(backupPath, filePath); process.exit(1); }
norm = norm.replace(searchB, () => replaceB);
console.log('  Edit B (receipt CSS): OK');

// === EDIT C: Add receipt modal HTML before <div class="toast" ===
const searchC = '<div class="toast" id="toast" role="status" aria-live="polite"></div>';
const receiptModalHTML = `<div class="receipt-modal-bg" id="receiptModalBg" role="dialog" aria-modal="true" aria-labelledby="receiptTitle"><div class="receipt-modal"><div class="receipt-modal-head"><div><div class="kicker">Booking confirmation</div><h2 id="receiptTitle">Your booking receipt</h2></div><button class="close" id="closeReceipt" aria-label="Close">&times;</button></div><div class="receipt-body" id="receiptBody"></div><div class="receipt-actions"><button class="btn btn-blue" id="receiptImageBtn" type="button">Save as image</button><button class="btn btn-blue" id="receiptPdfBtn" type="button">Save as PDF</button><button class="btn btn-outline" id="receiptCloseBtn" type="button">Close</button></div></div></div>\n` + searchC;
let cntC = 0, idxC = 0;
while ((idxC = norm.indexOf(searchC, idxC)) >= 0) { cntC++; idxC++; }
if (cntC !== 1) { console.log('  Edit C: FAILED (' + cntC + ' matches for toast div)'); fs.copyFileSync(backupPath, filePath); process.exit(1); }
norm = norm.replace(searchC, () => receiptModalHTML);
console.log('  Edit C (receipt modal HTML): OK');

// === EDIT D: Add receipt JS functions before loadSiteSettings(); ===
const searchD = "loadPaymentMethods();loadSiteSettings();";
const receiptJS = `let receiptData=null;
function formatFjdMinor(m){return 'FJ$'+(Number(m)/100).toFixed(2)}
function formatFjd(d){return 'FJ$'+Number(d).toFixed(2)}
function formatFijiDateTime(iso){try{return new Intl.DateTimeFormat('en-FJ',{timeZone:'Pacific/Fiji',dateStyle:'medium',timeStyle:'short'}).format(new Date(iso))+' Fiji time'}catch{return iso}}
function buildReceiptHTML(d){
const isDeposit=d.paymentOption==='deposit';
const isPaidFull=d.paymentStatus==='paid';
const isDepositPaid=d.paymentStatus==='deposit_paid';
const isPending=d.status==='pending_payment';
const isConfirmed=d.status==='confirmed';
let st='';
if(isPending)st='Pending Payment';
else if(isConfirmed&&isPaidFull)st='Confirmed \\u2014 Paid in Full';
else if(isConfirmed&&isDepositPaid)st='Confirmed \\u2014 Deposit Paid';
else if(d.status==='rejected')st='Rejected';
else if(d.status==='cancelled')st='Cancelled';
else st=String(d.status||'').replaceAll('_',' ');
let note='';
if(isPending){
if(isDeposit){note='<div class="receipt-note">Deposit of '+formatFjdMinor(d.amountDue)+' is due now. Remaining balance of '+formatFjdMinor(d.balanceDue)+' is due on vehicle pickup.</div>'}
else{note='<div class="receipt-note">Full payment of '+formatFjdMinor(d.amountDue)+' is due now to confirm your booking.</div>'}
}else if(isConfirmed&&isPaidFull){note='<div class="receipt-note receipt-note-paid">Paid in full. No balance due.</div>'}
else if(isConfirmed&&isDepositPaid){note='<div class="receipt-note receipt-note-paid">Deposit paid. Balance of '+formatFjdMinor(d.balanceDue)+' due on vehicle pickup.</div>'}
let discountRow='';
if(d.discountAmount>0){
const dl=d.discountType==='automatic'?'Long-rental discount':('Discount code '+(d.discountReference||''));
discountRow='<div class="receipt-row"><span class="receipt-label">Discount ('+dl+', '+d.discountPercent+'%)</span><span class="receipt-value receipt-discount">\\u2212'+formatFjdMinor(d.discountAmount)+'</span></div>'}
let payInfo='';
if(d.paymentInstructions){payInfo='<div class="receipt-section"><h4>Payment Method: '+(d.paymentMethod==='bank_transfer'?'Bank Transfer':'M-PAiSA')+'</h4><div class="receipt-instructions">'+d.paymentInstructions+'</div></div>'}
let holdRow='';
if(isPending&&d.holdExpiresAt){holdRow='<div class="receipt-row"><span class="receipt-label">Hold Expires</span><span class="receipt-value">'+formatFijiDateTime(d.holdExpiresAt)+'</span></div>'}
return '<div class="receipt" id="receiptContent"><div class="receipt-header"><h3>Zims Rental Cars Nadi</h3><p class="receipt-subtitle">Booking Confirmation</p></div>'+
'<div class="receipt-section"><div class="receipt-row"><span class="receipt-label">Booking Reference</span><span class="receipt-value receipt-ref">'+d.bookingId+'</span></div><div class="receipt-row"><span class="receipt-label">Status</span><span class="receipt-value">'+st+'</span></div>'+holdRow+'</div>'+
'<div class="receipt-section"><h4>Customer</h4><div class="receipt-row"><span class="receipt-label">Name</span><span class="receipt-value">'+(d.customerName||'')+'</span></div><div class="receipt-row"><span class="receipt-label">Email</span><span class="receipt-value">'+(d.email||'')+'</span></div><div class="receipt-row"><span class="receipt-label">Phone</span><span class="receipt-value">'+(d.phone||'')+'</span></div></div>'+
'<div class="receipt-section"><h4>Vehicle &amp; Rental</h4><div class="receipt-row"><span class="receipt-label">Vehicle</span><span class="receipt-value">'+(d.vehicleName||'')+'</span></div><div class="receipt-row"><span class="receipt-label">Pickup</span><span class="receipt-value">'+formatFijiDateTime(d.pickupAt)+'</span></div><div class="receipt-row"><span class="receipt-label">Return</span><span class="receipt-value">'+formatFijiDateTime(d.returnAt)+'</span></div>'+(d.days?'<div class="receipt-row"><span class="receipt-label">Duration</span><span class="receipt-value">'+d.days+' billable day(s)</span></div>':'')+'</div>'+
'<div class="receipt-section"><h4>Payment Summary</h4>'+(d.dailyRate?'<div class="receipt-row"><span class="receipt-label">Daily Rate</span><span class="receipt-value">'+formatFjd(d.dailyRate)+'</span></div>':'')+(d.originalSubtotal?'<div class="receipt-row"><span class="receipt-label">Original Subtotal</span><span class="receipt-value">'+formatFjdMinor(d.originalSubtotal)+'</span></div>':'')+discountRow+'<div class="receipt-row receipt-total"><span class="receipt-label">Rental Total</span><span class="receipt-value">'+formatFjdMinor(d.rentalTotal)+'</span></div><div class="receipt-divider"></div><div class="receipt-row"><span class="receipt-label">Payment Option</span><span class="receipt-value">'+(isDeposit?'Deposit ('+d.depositPercent+'%)':'Full Payment')+'</span></div><div class="receipt-row"><span class="receipt-label">Amount Due Now</span><span class="receipt-value">'+formatFjdMinor(d.amountDue)+'</span></div>'+(d.balanceDue>0?'<div class="receipt-row"><span class="receipt-label">Remaining Balance</span><span class="receipt-value">'+formatFjdMinor(d.balanceDue)+' (due on pickup)</span></div>':'')+'</div>'+
note+payInfo+
'<div class="receipt-section"><h4>Next Steps</h4><ol class="receipt-steps"><li>Pay the amount due via your bank or M-PAiSA app</li><li>Return to this site and enter the transaction reference</li><li>Zims verifies your payment (within 24 hours)</li><li>You will receive confirmation once approved</li></ol></div>'+
'<div class="receipt-footer"><p><strong>Zims Rental Cars Nadi</strong></p><p>WhatsApp: <a href="https://wa.me/6799042101">+679 904 2101</a></p><p>Save this receipt for your records.</p></div></div>';
}
function showReceipt(d){receiptData=d;const b=document.getElementById('receiptBody');b.innerHTML=buildReceiptHTML(d);const m=document.getElementById('receiptModalBg');m.classList.add('show');document.body.style.overflow='hidden'}
function closeReceipt(){const m=document.getElementById('receiptModalBg');m.classList.remove('show');document.body.style.overflow=''}
async function downloadReceiptAsImage(){
if(!receiptData)return;
const c=document.getElementById('receiptContent');
if(!c)return;
try{
const canvas=await html2canvas(c,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false});
const link=document.createElement('a');
link.download='zims-booking-'+receiptData.bookingId+'.png';
link.href=canvas.toDataURL('image/png');
document.body.append(link);
link.click();
link.remove();
toast('Receipt image saved.');
}catch(err){toast('Could not save image: '+err.message)}
}
async function downloadReceiptAsPdf(){
if(!receiptData)return;
const c=document.getElementById('receiptContent');
if(!c)return;
try{
const canvas=await html2canvas(c,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false});
const imgData=canvas.toDataURL('image/png');
const{jsPDF}=window.jspdf;
const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'4'});
const pageWidth=210,pageHeight=297;
const imgWidth=pageWidth-20;
const imgHeight=(canvas.height*imgWidth)/canvas.width;
let heightLeft=imgHeight;
let position=10;
pdf.addImage(imgData,'PNG',10,position,imgWidth,imgHeight);
heightLeft-=(pageHeight-20);
while(heightLeft>0){
position=10-(imgHeight-heightLeft);
pdf.addPage();
pdf.addImage(imgData,'PNG',10,position,imgWidth,imgHeight);
heightLeft-=(pageHeight-20);
}
pdf.save('zims-booking-'+receiptData.bookingId+'.pdf');
toast('Receipt PDF saved.');
}catch(err){toast('Could not save PDF: '+err.message)}
}
document.addEventListener('DOMContentLoaded',()=>{
const m=document.getElementById('receiptModalBg');
document.getElementById('closeReceipt').addEventListener('click',closeReceipt);
document.getElementById('receiptCloseBtn').addEventListener('click',closeReceipt);
document.getElementById('receiptImageBtn').addEventListener('click',downloadReceiptAsImage);
document.getElementById('receiptPdfBtn').addEventListener('click',downloadReceiptAsPdf);
if(m)m.addEventListener('click',e=>{if(e.target===m)closeReceipt()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&m.classList.contains('show'))closeReceipt()});
});
`;
const replaceD = receiptJS + '\n' + searchD;
let cntD = 0, idxD = 0;
while ((idxD = norm.indexOf(searchD, idxD)) >= 0) { cntD++; idxD++; }
if (cntD !== 1) { console.log('  Edit D: FAILED (' + cntD + ' matches for loadPaymentMethods init)'); fs.copyFileSync(backupPath, filePath); process.exit(1); }
norm = norm.replace(searchD, () => replaceD);
console.log('  Edit D (receipt JS functions): OK');

// === EDIT E: Modify booking-request success handler to show receipt ===
// After: $('checkout-hold-note').textContent='Your vehicle is held for up to 15 minutes...'
// Add: showReceipt() call with all booking data
const searchE = "$('checkout-hold-note').textContent='Your vehicle is held for up to 15 minutes while you switch apps and make the payment. After reference submission, the hold extends to 24 hours for owner review.'}";
const replaceE = searchE + "\nshowReceipt({bookingId:data.booking_id,customerName:$('guestName').value,email,phone:fullGuestPhone(),vehicleName:selected.name,pickupAt:pickup,returnAt:ret,days:data.rental_days,dailyRate:Number(data.daily_rate_fjd_minor)/100,originalSubtotal:data.original_subtotal_fjd_minor,discountType:data.discount_type,discountReference:data.discount_reference,discountPercent:data.discount_percent,discountAmount:data.discount_amount_fjd_minor||0,rentalTotal:data.rental_total_fjd_minor,paymentOption:data.payment_option||$('paymentOption').value,depositPercent:data.deposit_percent_snapshot,amountDue:data.amount_due_fjd_minor,balanceDue:data.balance_due_fjd_minor,status:data.status||'pending_payment',paymentStatus:'pending',holdExpiresAt:data.hold_expires_at,paymentMethod:activeCheckout.paymentMethod,paymentInstructions:$('manual-payment-instructions').innerHTML});";
let cntE = 0, idxE = 0;
while ((idxE = norm.indexOf(searchE, idxE)) >= 0) { cntE++; idxE++; }
if (cntE !== 1) { console.log('  Edit E: FAILED (' + cntE + ' matches for checkout-hold-note). May already be applied.'); fs.copyFileSync(backupPath, filePath); process.exit(1); }
norm = norm.replace(searchE, () => replaceE);
console.log('  Edit E (show receipt after booking): OK');

// === EDIT F: Add download receipt button in booking-lookup result ===
// After the existing "Contact Zims about this booking" link, add a "Download Receipt" button
const searchF = "contact.textContent='Contact Zims about this booking';result.append(contact)}catch(error)";
const replaceF = "contact.textContent='Contact Zims about this booking';result.append(contact);" +
"const dlBtn=document.createElement('button');" +
"dlBtn.className='btn btn-blue';" +
"dlBtn.textContent='Download Receipt';" +
"dlBtn.style.cssText='display:block;width:100%;margin-top:10px';" +
"dlBtn.addEventListener('click',()=>{" +
"showReceipt({bookingId:b.reference,customerName:'',email:$('manageEmail').value.trim(),phone:'',vehicleName:b.vehicle_name,pickupAt:b.pickup_at,returnAt:b.return_at,days:0,dailyRate:0,originalSubtotal:0,discountType:null,discountReference:null,discountPercent:0,discountAmount:0,rentalTotal:Number(b.rental_total_fjd)*100,paymentOption:b.payment_option,depositPercent:null,amountDue:b.amount_due_fjd_minor,balanceDue:b.balance_due_fjd_minor,status:b.hold_expired?'pending_payment':b.status,paymentStatus:b.payment_status,holdExpiresAt:b.hold_expires_at,paymentMethod:null,paymentInstructions:''});" +
"});" +
"result.append(dlBtn)}catch(error)";
let cntF = 0, idxF = 0;
while ((idxF = norm.indexOf(searchF, idxF)) >= 0) { cntF++; idxF++; }
if (cntF !== 1) { console.log('  Edit F: FAILED (' + cntF + ' matches for lookup contact). May already be applied.'); fs.copyFileSync(backupPath, filePath); process.exit(1); }
norm = norm.replace(searchF, () => replaceF);
console.log('  Edit F (lookup download button): OK');

// === Write back ===
console.log('[4/8] Re-normalizing line endings...');
norm = norm.replace(/\r\n/g, '\n');
if (hasCrlf) { norm = norm.replace(/\n/g, '\r\n'); }
console.log('[5/8] Writing file back...');
const utf8Bytes = Buffer.from(norm, 'utf8');
let finalBytes;
if (hasBom) { finalBytes = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), utf8Bytes]); } else { finalBytes = utf8Bytes; }
fs.writeFileSync(filePath, finalBytes);
console.log('  File written.');
console.log('[6/8] Verification:');
const hasReceiptModal = norm.includes('id="receiptModalBg"');
const hasShowReceipt = norm.includes('function showReceipt(');
const hasDownloadImg = norm.includes('async function downloadReceiptAsImage(');
const hasDownloadPdf = norm.includes('async function downloadReceiptAsPdf(');
const hasHtml2canvas = norm.includes('html2canvas');
const hasJsPdf = norm.includes('jspdf');
const hasLookupBtn = norm.includes("dlBtn.textContent='Download Receipt'");
console.log('  Receipt modal HTML: ' + (hasReceiptModal ? 'YES' : 'NO'));
console.log('  showReceipt() function: ' + (hasShowReceipt ? 'YES' : 'NO'));
console.log('  downloadReceiptAsImage(): ' + (hasDownloadImg ? 'YES' : 'NO'));
console.log('  downloadReceiptAsPdf(): ' + (hasDownloadPdf ? 'YES' : 'NO'));
console.log('  html2canvas CDN: ' + (hasHtml2canvas ? 'YES' : 'NO'));
console.log('  jsPDF CDN: ' + (hasJsPdf ? 'YES' : 'NO'));
console.log('  Lookup download button: ' + (hasLookupBtn ? 'YES' : 'NO'));
console.log('');
console.log('[7/8] JS syntax check...');
const scriptMatch = norm.match(/<script type="module">([\s\S]*?)<\/script>/);
if (scriptMatch) {
  fs.writeFileSync('/tmp/receipt-check.mjs', scriptMatch[1]);
  const { execSync } = require('child_process');
  try {
    execSync('node --check /tmp/receipt-check.mjs', { stdio: 'pipe' });
    console.log('  JS syntax: OK');
  } catch (e) {
    console.log('  JS syntax: ERROR');
    console.log('  ' + e.stderr.toString().split('\n').slice(0, 5).join('\n  '));
    console.log('  Restoring from backup...');
    fs.copyFileSync(backupPath, filePath);
    console.log('  Restored.');
    process.exit(1);
  }
}
console.log('');
console.log('[8/8] Summary');
console.log('  Edits applied: 6 (A=CDN scripts, B=CSS, C=modal HTML, D=JS functions, E=booking hook, F=lookup button)');
console.log('  Backup file:   ' + backupPath);
console.log('  File size:     ' + finalBytes.length + ' bytes (was ' + rawBytes.length + ', diff ' + (finalBytes.length - rawBytes.length) + ')');
console.log('');
console.log('  NEXT STEPS:');
console.log('   1. Paste back: all 6 edit statuses + verification checks + JS syntax result');
console.log('   2. After I confirm, run:  npm test');
console.log('   3. Then run:  npm run dev  and test booking flow + booking lookup');
console.log('   4. After booking is created, receipt modal should appear automatically');
console.log('   5. After booking lookup, "Download Receipt" button should appear');
console.log('');
