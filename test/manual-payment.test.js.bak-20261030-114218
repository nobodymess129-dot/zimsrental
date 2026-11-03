import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

const migrations = ['initial','seed_vehicles','booking_holds','booking_cancellation','booking_payment_snapshots','promotional_banners','booking_discounts','manual_payment_review','expand_site_settings','vehicle_fleet_quantity'];
function makeEnvironment() {
  const database = new DatabaseSync(':memory:');
  migrations.forEach((name, i) => database.exec(readFileSync(new URL(`../migrations/${String(i + 1).padStart(4, '0')}_${name}.sql`, import.meta.url), 'utf8')));
  const DB = {
    prepare(sql) { let values=[]; const statement={bind(...input){values=input;return statement;},async first(){return database.prepare(sql).get(...values)??null;},async all(){return {results:database.prepare(sql).all(...values)};},async run(){const result=database.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};}};return statement; },
    async batch(statements) { database.exec('BEGIN'); try { const results=[]; for(const statement of statements)results.push(await statement.run()); database.exec('COMMIT'); return results; } catch(error) { database.exec('ROLLBACK'); throw error; } }
  };
  database.prepare(`UPDATE payment_method_settings SET enabled=1,config_json=? WHERE method_key='bank_transfer'`).run(JSON.stringify({bank_name:'Test Bank',account_name:'Zims Rentals',account_number:'000123',branch:'Nadi',instructions:'Use booking ID as payment description.'}));
  const imageObjects=new Map();
  const env={DB,ADMIN_EMAIL:'owner@example.test',ADMIN_PASSWORD:'fixture-password-not-a-real-credential',SESSION_SECRET:'unit-test-only-session-secret-with-sufficient-length',BOOKING_LIMITER:{limit:async()=>({success:true})},PUBLIC_API_LIMITER:{limit:async()=>({success:true})},LOGIN_IP_LIMITER:{limit:async()=>({success:true})},LOGIN_ACCOUNT_LIMITER:{limit:async()=>({success:true})},ADMIN_UPLOAD_LIMITER:{limit:async()=>({success:true})},VEHICLE_IMAGES:{async put(key,bytes,options){imageObjects.set(key,{bytes:Uint8Array.from(bytes),options});},async delete(key){imageObjects.delete(key);},async get(key){const object=imageObjects.get(key);return object?{body:new Response(object.bytes).body,httpEtag:'qr-test'}:null;}}};
  return {database,env,imageObjects};
}
async function request(env,path,{method='GET',body,cookie}={}) {
  const headers={}; if(body!==undefined)headers['content-type']='application/json';if(cookie)headers.cookie=cookie;
  return worker.fetch(new Request('http://unit.test'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
}
async function signIn(env) { const response=await request(env,'/api/login',{method:'POST',body:{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD}});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';',1)[0]; }
async function createManualBooking(env,requestId,dates=['2098-05-01T00:00:00.000Z','2098-05-03T00:00:00.000Z']) {
  const response=await request(env,'/api/booking-request',{method:'POST',body:{request_id:requestId,customer_name:'Test Guest',email:'guest@example.test',phone:'+6790000000',vehicle_id:'fielder',pickup_at:dates[0],return_at:dates[1],payment_option:'full',payment_method:'bank_transfer'}});
  assert.equal(response.status,201,await response.clone().text());return response.json();
}

test('manual payment config is public only when enabled and admin edits require authentication', async()=>{
  const {database,env}=makeEnvironment();
  try {
    const publicResponse=await request(env,'/api/payment-methods');const publicData=await publicResponse.json();
    assert.equal(publicData.methods.bank_transfer.enabled,true);assert.equal(publicData.methods.bank_transfer.account_number,'000123');
    assert.equal(publicData.methods.mpaisa.enabled,false);assert.equal(publicData.methods.mpaisa.mobile_number,undefined);
    const unauthorized=await request(env,'/api/admin/payment-methods',{method:'PUT',body:{methods:{bank_transfer:{enabled:false},mpaisa:{enabled:false}}}});
    assert.equal(unauthorized.status,401);
    const cookie=await signIn(env);
    const bad=await request(env,'/api/admin/payment-methods',{method:'PUT',cookie,body:{methods:{bank_transfer:{enabled:true,bank_name:'',account_name:'',account_number:''},mpaisa:{enabled:false}}}});
    assert.equal(bad.status,400);
    const good=await request(env,'/api/admin/payment-methods',{method:'PUT',cookie,body:{methods:{bank_transfer:{enabled:false},mpaisa:{enabled:true,recipient_name:'Zims Rentals',mobile_number:'+6799000000',qr_image_url:'',instructions:'Pay and keep your receipt.'}}}});
    assert.equal(good.status,200,await good.clone().text());
    const latest=await request(env,'/api/payment-methods');const methods=(await latest.json()).methods;
    assert.equal(methods.bank_transfer.enabled,false);assert.equal(methods.mpaisa.enabled,true);assert.equal(methods.mpaisa.mobile_number,'+6799000000');
  } finally {database.close();}
});

test('manual transaction reference extends the hold and only owner review can confirm payment', async()=>{
  const {database,env}=makeEnvironment();
  try {
    const booking=await createManualBooking(env,'11111111-1111-4111-8111-111111111111');
    let row=database.prepare('SELECT status,payment_status,payment_provider,hold_expires_at FROM bookings WHERE id=?').get(booking.booking_id);
    assert.equal(row.payment_provider,'bank_transfer');assert.equal(row.status,'pending_payment');assert.equal(row.payment_status,'pending');
    const submit=await request(env,'/api/manual-payment/submit',{method:'POST',body:{booking_id:booking.booking_id,email:'guest@example.test',transaction_reference:'BANK-TXN-123456'}});
    assert.equal(submit.status,200,await submit.clone().text());
    const submitted=await submit.json();assert.match(submitted.message,/not confirmed yet/i);
    row=database.prepare('SELECT customer_payment_reference,payment_submitted_at,hold_expires_at,status,payment_status FROM bookings WHERE id=?').get(booking.booking_id);
    assert.equal(row.customer_payment_reference,'BANK-TXN-123456');assert.ok(row.payment_submitted_at);assert.ok(Date.parse(row.hold_expires_at)>Date.now()+23*60*60*1000);
    const cookie=await signIn(env);
    const blockedPatch=await request(env,'/api/admin/bookings/'+booking.booking_id,{method:'PATCH',cookie,body:{status:'confirmed'}});
    assert.equal(blockedPatch.status,403);
    const noReference=await request(env,'/api/manual-payment/submit',{method:'POST',body:{booking_id:booking.booking_id,email:'guest@example.test',transaction_reference:'x'}});
    assert.equal(noReference.status,400);
    const approve=await request(env,'/api/admin/bookings/'+booking.booking_id+'/review-payment',{method:'POST',cookie,body:{action:'approve',note:'Matched incoming bank transaction.'}});
    assert.equal(approve.status,200,await approve.clone().text());assert.deepEqual(await approve.json(),{ok:true,status:'confirmed',payment_status:'paid'});
    row=database.prepare('SELECT status,payment_status,payment_reviewed_by,payment_review_note FROM bookings WHERE id=?').get(booking.booking_id);
    assert.equal(row.status,'confirmed');assert.equal(row.payment_status,'paid');assert.equal(row.payment_reviewed_by,'owner@example.test');assert.equal(row.payment_review_note,'Matched incoming bank transaction.');
    const secondApprove=await request(env,'/api/admin/bookings/'+booking.booking_id+'/review-payment',{method:'POST',cookie,body:{action:'approve'}});
    assert.equal(secondApprove.status,409);
  } finally {database.close();}
});

test('manual payment rejection requires a reason, marks payment failed and releases hold', async()=>{
  const {database,env}=makeEnvironment();
  try {
    const booking=await createManualBooking(env,'22222222-2222-4222-8222-222222222222',['2098-06-01T00:00:00.000Z','2098-06-03T00:00:00.000Z']);
    const submit=await request(env,'/api/manual-payment/submit',{method:'POST',body:{booking_id:booking.booking_id,email:'guest@example.test',transaction_reference:'BANK-TXN-REJECT'}});assert.equal(submit.status,200);
    const cookie=await signIn(env);
    const missingReason=await request(env,'/api/admin/bookings/'+booking.booking_id+'/review-payment',{method:'POST',cookie,body:{action:'reject'}});assert.equal(missingReason.status,400);
    const reject=await request(env,'/api/admin/bookings/'+booking.booking_id+'/review-payment',{method:'POST',cookie,body:{action:'reject',note:'No matching incoming transaction was found.'}});assert.equal(reject.status,200,await reject.clone().text());
    const row=database.prepare('SELECT status,payment_status,hold_expires_at,payment_review_note FROM bookings WHERE id=?').get(booking.booking_id);
    assert.equal(row.status,'rejected');assert.equal(row.payment_status,'failed');assert.ok(Date.parse(row.hold_expires_at)<=Date.now());assert.equal(row.payment_review_note,'No matching incoming transaction was found.');
  } finally {database.close();}
});


test('owner can upload a validated M-PAiSA QR image and the public path serves typed image data', async()=>{
  const {database,env,imageObjects}=makeEnvironment();
  try {
    const cookie=await signIn(env);
    const settings=await request(env,'/api/admin/payment-methods',{method:'PUT',cookie,body:{methods:{bank_transfer:{enabled:false},mpaisa:{enabled:true,recipient_name:'Zims Rentals',mobile_number:'+6799000000',qr_image_url:'',instructions:'Scan to pay.'}}}});
    assert.equal(settings.status,200);
    const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,0,0,0,0,0,0,0,0,73,69,78,68,0,0,0,0]);
    const form=new FormData();form.set('file',new Blob([png],{type:'image/png'}),'untrusted.png');
    const uploaded=await worker.fetch(new Request('http://unit.test/api/admin/payment-qr/image',{method:'POST',headers:{cookie},body:form}),env);
    assert.equal(uploaded.status,200,await uploaded.clone().text());
    const result=await uploaded.json();assert.match(result.image_path,/^\/api\/payment-qr\/[0-9a-f-]{36}\.png$/);
    assert.equal(imageObjects.size,1);
    const publicConfig=await request(env,'/api/payment-methods');assert.equal((await publicConfig.json()).methods.mpaisa.qr_image_url,result.image_path);
    const imageResponse=await request(env,result.image_path);assert.equal(imageResponse.status,200);assert.equal(imageResponse.headers.get('content-type'),'image/png');
  } finally {database.close();}
});

test('manual review refuses expired holds and overlapping confirmed bookings', async()=>{
  const {database,env}=makeEnvironment();
  try {
    const cookie=await signIn(env);
    const expired=await createManualBooking(env,'33333333-3333-4333-8333-333333333333',['2098-07-01T00:00:00.000Z','2098-07-03T00:00:00.000Z']);
    assert.equal((await request(env,'/api/manual-payment/submit',{method:'POST',body:{booking_id:expired.booking_id,email:'guest@example.test',transaction_reference:'BANK-TXN-EXPIRED'}})).status,200);
    database.prepare('UPDATE bookings SET hold_expires_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),expired.booking_id);
    const expiredReview=await request(env,'/api/admin/bookings/'+expired.booking_id+'/review-payment',{method:'POST',cookie,body:{action:'approve'}});
    assert.equal(expiredReview.status,409);
    assert.equal(database.prepare('SELECT status FROM bookings WHERE id=?').get(expired.booking_id).status,'pending_payment');

    const conflicted=await createManualBooking(env,'44444444-4444-4444-8444-444444444444',['2098-08-01T00:00:00.000Z','2098-08-03T00:00:00.000Z']);
    assert.equal((await request(env,'/api/manual-payment/submit',{method:'POST',body:{booking_id:conflicted.booking_id,email:'guest@example.test',transaction_reference:'BANK-TXN-CONFLICT'}})).status,200);
    database.prepare(`INSERT INTO bookings (id,customer_name,email,vehicle_id,pickup_at,return_at,status,payment_status,total_fjd) VALUES (?,?,?,?,?,?,'confirmed','paid',100)`)
      .run('55555555-5555-4555-8555-555555555555','Other Guest','other@example.test','fielder','2098-08-01T00:00:00.000Z','2098-08-03T00:00:00.000Z');
    const conflictReview=await request(env,'/api/admin/bookings/'+conflicted.booking_id+'/review-payment',{method:'POST',cookie,body:{action:'approve'}});
    assert.equal(conflictReview.status,409);assert.match((await conflictReview.json()).error,/overlaps these dates/i);
    assert.equal(database.prepare('SELECT status FROM bookings WHERE id=?').get(conflicted.booking_id).status,'pending_payment');
  } finally {database.close();}
});
