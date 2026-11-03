// Zims Rental Cars Nadi - Phase 3, Edits 5+6 (PayPal HTML + JS removal)
const fs = require('fs');
const path = require('path');
const filePath = path.join(process.cwd(), 'public', 'index.html');
console.log('');
console.log('===================================================');
console.log(' Zims Phase 3, Edits 5+6 - PayPal HTML + JS removal');
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
console.log('[3/8] Reading file and detecting encoding...');
const rawBytes = fs.readFileSync(filePath);
const hasBom = rawBytes.length >= 3 && rawBytes[0] === 0xEF && rawBytes[1] === 0xBB && rawBytes[2] === 0xBF;
let content = hasBom ? rawBytes.slice(3).toString('utf8') : rawBytes.toString('utf8');
console.log('  Encoding: ' + (hasBom ? 'UTF-8 with BOM' : 'UTF-8 (no BOM)'));
const hasCrlf = content.includes('\r\n');
console.log('  Line endings: ' + (hasCrlf ? 'CRLF' : 'LF') + ' (will be preserved)');
let norm = content.replace(/\r\n/g, '\n');
const edits = [
  { name: '5', search: `<div id="paypalPaymentPanel"><h3 style="font:800 16px Manrope;margin:18px 0 10px">Choose your PayPal checkout</h3><div id="paypal-wallet-button"></div><div id="paypal-card-button" style="margin-top:10px"></div><p class="notice">PayPal sign-in and guest debit/credit card options depend on PayPal eligibility. Your card details are entered only in PayPal's checkout.</p></div>`, replace: '' },
  { name: '6a', search: `let paypalConfig={enabled:false};let paymentMethods={methods:{paypal:{enabled:false},bank_transfer:{enabled:false},mpaisa:{enabled:false}}};let activeCheckout=null;let paypalScriptPromise=null;`, replace: `let paymentMethods={methods:{bank_transfer:{enabled:false},mpaisa:{enabled:false}}};let activeCheckout=null;` },
  { name: '6b', search: `Online checkout uses PayPal when configured; otherwise continue through WhatsApp without creating a hold.`, replace: `Continue through WhatsApp if online payment is unavailable.` },
  { name: '6c', search: `async function loadPaypalConfig(){try{const response=await fetch('/api/paypal/config');if(response.ok){const data=await response.json();paypalConfig=data&&data.enabled&&data.client_id&&data.currency?data:{enabled:false}}}catch{paypalConfig={enabled:false}}await loadPaymentMethods()}`, replace: '' },
  { name: '6d', search: `async function loadPaymentMethods(){const select=$('paymentMethod'),notice=$('checkout-notice'),button=$('booking-submit-button');try{const response=await fetch('/api/payment-methods');const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load payment methods');paymentMethods=data;select.replaceChildren();const available=[];if(data.methods?.paypal?.enabled&&paypalConfig.enabled)available.push(['paypal','PayPal / eligible card']);if(data.methods?.bank_transfer?.enabled)available.push(['bank_transfer','Bank transfer']);if(data.methods?.mpaisa?.enabled)available.push(['mpaisa','M-PAiSA']);if(!available.length){select.add(new Option('No online payment methods available',''));notice.textContent='Online payments are not configured yet. You can still contact Zims on WhatsApp to request a booking.';button.textContent='Contact Zims on WhatsApp';button.disabled=false;return}for(const [value,label] of available)select.add(new Option(label,value));select.value=available[0][0];notice.textContent='Your vehicle will be held for 15 minutes while you complete payment setup. Manual payments stay pending until the owner verifies the transaction.';button.textContent=select.value==='paypal'?'Continue to secure checkout':'Create temporary hold';button.disabled=false;select.onchange=()=>{button.textContent=select.value==='paypal'?'Continue to secure checkout':'Create temporary hold';notice.textContent=select.value==='paypal'?'Your vehicle will be held for up to 15 minutes while you complete PayPal checkout.':'Your vehicle will be held for up to 15 minutes while you switch to your payment app. Submit your transaction reference before the hold expires.'}}catch{paymentMethods={methods:{paypal:{enabled:!!paypalConfig.enabled},bank_transfer:{enabled:false},mpaisa:{enabled:false}}};select.replaceChildren(new Option(paypalConfig.enabled?'PayPal / eligible card':'Contact Zims on WhatsApp',paypalConfig.enabled?'paypal':'contact'));button.textContent=paypalConfig.enabled?'Continue to secure checkout':'Contact Zims on WhatsApp';button.disabled=false;notice.textContent=paypalConfig.enabled?'Your server-calculated quote will be held for up to 15 minutes while you complete PayPal checkout.':'Payment methods could not be loaded. Contact Zims to arrange a booking.'}}`, replace: `async function loadPaymentMethods(){const select=$('paymentMethod'),notice=$('checkout-notice'),button=$('booking-submit-button');try{const response=await fetch('/api/payment-methods');const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load payment methods');paymentMethods=data;select.replaceChildren();const available=[];if(data.methods?.bank_transfer?.enabled)available.push(['bank_transfer','Bank transfer']);if(data.methods?.mpaisa?.enabled)available.push(['mpaisa','M-PAiSA']);if(!available.length){select.add(new Option('No online payment methods available',''));notice.textContent='Online payments are not configured yet. You can still contact Zims on WhatsApp to request a booking.';button.textContent='Contact Zims on WhatsApp';button.disabled=false;return}for(const [value,label] of available)select.add(new Option(label,value));select.value=available[0][0];notice.textContent='Your vehicle will be held for 15 minutes while you complete payment setup. Manual payments stay pending until the owner verifies the transaction.';button.textContent='Create temporary hold';button.disabled=false;select.onchange=()=>{button.textContent='Create temporary hold';notice.textContent='Your vehicle will be held for up to 15 minutes while you switch to your payment app. Submit your transaction reference before the hold expires.'}}catch{paymentMethods={methods:{bank_transfer:{enabled:false},mpaisa:{enabled:false}}};select.replaceChildren(new Option('Contact Zims on WhatsApp','contact'));button.textContent='Contact Zims on WhatsApp';button.disabled=false;notice.textContent='Payment methods could not be loaded. Contact Zims to arrange a booking.'}}` },
  { name: '6e', search: `async function loadPayPalSdk(){if(window.paypal)return window.paypal;if(paypalScriptPromise)return paypalScriptPromise;paypalScriptPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://www.paypal.com/sdk/js?client-id='+encodeURIComponent(paypalConfig.client_id)+'&currency='+encodeURIComponent(paypalConfig.currency)+'&intent=capture&components=buttons&enable-funding=card';script.async=true;script.onload=()=>window.paypal?resolve(window.paypal):reject(new Error('PayPal checkout did not initialize.'));script.onerror=()=>reject(new Error('Could not load PayPal checkout. Check your connection and try again.'));document.head.append(script)});return paypalScriptPromise}`, replace: '' },
  { name: '6f', search: `async function renderPayPalButtons(){const wallet=$('paypal-wallet-button'),card=$('paypal-card-button');wallet.replaceChildren();card.replaceChildren();const paypal=await loadPayPalSdk();const common={createOrder:async()=>{if(!activeCheckout)throw new Error('Booking details are missing.');const response=await fetch('/api/paypal/create-order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({booking_id:activeCheckout.bookingId,email:activeCheckout.email})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not start PayPal checkout.');$('checkout-amount').textContent='Amount due: FJ$'+(activeCheckout.amountDueMinor/100).toFixed(2)+' \u00b7 PayPal charge: '+data.currency+' '+data.amount+' \u00b7 Remaining FJD balance: FJ$'+(activeCheckout.balanceDueMinor/100).toFixed(2);return data.order_id},onApprove:async data=>{const response=await fetch('/api/paypal/capture-order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({booking_id:activeCheckout.bookingId,email:activeCheckout.email,order_id:data.orderID})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Payment could not be confirmed.');$('checkout-amount').textContent=result.manual_review?'Payment received, but the booking needs manual review because the vehicle hold changed or expired. Contact Zims before travelling.':'Payment confirmed. Your booking is confirmed.';wallet.replaceChildren();card.replaceChildren();$('checkout-back').textContent=result.manual_review?'Contact Zims on WhatsApp':'Close';$('checkout-back').dataset.mode=result.manual_review?'contact':'close';if(!result.manual_review)activeCheckout=null;toast(result.manual_review?'Payment received; contact Zims for booking confirmation.':'Payment successful. Your booking is confirmed.');},onError:error=>{toast(error?.message||'PayPal checkout failed. You can retry while your hold is active.')}};const walletButton=paypal.Buttons({...common,fundingSource:paypal.FUNDING.PAYPAL,style:{layout:'vertical',shape:'rect',label:'paypal'}});if(walletButton.isEligible())await walletButton.render(wallet);try{const cardButton=paypal.Buttons({...common,fundingSource:paypal.FUNDING.CARD,style:{layout:'vertical',shape:'rect',label:'pay'}});if(cardButton.isEligible())await cardButton.render(card)}catch{const note=document.createElement('p');note.className='notice';note.textContent='Guest card checkout is not available for this account or transaction. You can still try PayPal checkout.';card.append(note)}if(!wallet.childElementCount&&!card.childElementCount)throw new Error('PayPal does not currently offer a checkout method for this account. Contact Zims to arrange payment.')}`, replace: '' },
  { name: '6g', search: `$('paypalCheckout').hidden=false;$('paypalPaymentPanel').hidden=activeCheckout.paymentMethod!=='paypal';$('manualPaymentPanel').hidden=activeCheckout.paymentMethod==='paypal';if(activeCheckout.paymentMethod==='paypal'){await renderPayPalButtons()}else{const method=paymentMethods.methods[activeCheckout.paymentMethod];`, replace: `$('paypalCheckout').hidden=false;$('manualPaymentPanel').hidden=false;{const method=paymentMethods.methods[activeCheckout.paymentMethod];` },
  { name: '6h', search: `finally{btn.disabled=false;btn.textContent=($('paymentMethod').value==='paypal')?'Continue to secure checkout':'Create temporary hold'}});`, replace: `finally{btn.disabled=false;btn.textContent='Create temporary hold'}});` },
  { name: '6i', search: `loadPaypalConfig();loadSiteSettings();`, replace: `loadPaymentMethods();loadSiteSettings();` }
];
console.log('[4/8] Verifying and applying edits...');
let appliedCount = 0;
for (const edit of edits) {
  process.stdout.write('  Edit ' + edit.name + ': ');
  let count = 0, startAt = 0;
  while (true) { const found = norm.indexOf(edit.search, startAt); if (found < 0) break; count++; startAt = found + 1; }
  if (count === 0) { console.log('NOT FOUND'); console.log('  Aborting. Restoring from backup...'); fs.copyFileSync(backupPath, filePath); console.log('  Restored. No changes were applied.'); process.exit(1); }
  if (count > 1) { console.log('FOUND ' + count + ' TIMES (expected 1)'); console.log('  Aborting. Restoring from backup...'); fs.copyFileSync(backupPath, filePath); console.log('  Restored. No changes were applied.'); process.exit(1); }
  norm = norm.replace(edit.search, edit.replace);
  appliedCount++;
  console.log('OK (applied exactly once)');
}
console.log('[5/8] Re-normalizing line endings...');
norm = norm.replace(/\r\n/g, '\n');
if (hasCrlf) { norm = norm.replace(/\n/g, '\r\n'); }
console.log('[6/8] Writing file back...');
const utf8Bytes = Buffer.from(norm, 'utf8');
let finalBytes;
if (hasBom) { finalBytes = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), utf8Bytes]); } else { finalBytes = utf8Bytes; }
fs.writeFileSync(filePath, finalBytes);
console.log('  File written.');
console.log('[7/8] Verification:');
const remainingPaypal = (norm.match(/paypal/gi) || []).length;
console.log('  Remaining paypal references (case-insensitive): ' + remainingPaypal);
const paypalCheckoutRefs = (norm.match(/paypalCheckout/g) || []).length;
console.log('  Of those, paypalCheckout section ID references: ' + paypalCheckoutRefs + ' (expected - kept per your choice)');
const otherPaypal = remainingPaypal - paypalCheckoutRefs;
console.log('  Other PayPal references: ' + otherPaypal + ' (should be 0)');
if (norm.includes('manualPaymentPanel') && norm.includes('manual-payment-instructions')) { console.log('  Manual payment panel: PRESERVED'); } else { console.log('  WARNING: Manual payment panel missing!'); }
console.log('');
console.log('[8/8] Summary');
console.log('  Edits applied: ' + appliedCount + ' of ' + edits.length);
console.log('  Backup file:   ' + backupPath);
console.log('  File size:     ' + finalBytes.length + ' bytes (was ' + rawBytes.length + ', diff ' + (finalBytes.length - rawBytes.length) + ')');
console.log('');
console.log('  NEXT STEPS:');
console.log('   1. Paste back: edits applied count, remaining PayPal ref count, other PayPal ref count, manual panel status');
console.log('   2. After I confirm, run:  npm test');
console.log('   3. Paste the test output back to me');
console.log('');
