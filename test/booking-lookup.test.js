import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

function environment() {
  const database = new DatabaseSync(':memory:');
  const migrations = ['initial','seed_vehicles','booking_holds','booking_cancellation','booking_payment_snapshots','promotional_banners','booking_discounts','manual_payment_review','expand_site_settings','vehicle_fleet_quantity'];
  migrations.forEach((name, i) => database.exec(readFileSync(new URL(`../migrations/${String(i + 1).padStart(4, '0')}_${name}.sql`, import.meta.url), 'utf8')));
  
  database.prepare(`
    UPDATE payment_method_settings
    SET enabled = 1, config_json = ?
    WHERE method_key = 'bank_transfer'
  `).run(JSON.stringify({
    bank_name: 'Test Bank',
    account_name: 'Zims Rentals',
    account_number: '000123',
    branch: 'Nadi',
    instructions: 'Use booking ID as payment description.'
  }));const DB = { prepare(sql) {
    let values=[]; const statement={bind(...input){values=input;return statement},
      async first(){return database.prepare(sql).get(...values)??null},
      async all(){return {results:database.prepare(sql).all(...values)}},
      async run(){const result=database.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}}}};return statement;
  }, async batch(statements){database.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());database.exec('COMMIT');return results}catch(error){database.exec('ROLLBACK');throw error}} };
  database.prepare('UPDATE vehicles SET deposit_percent=25 WHERE id=?').run('fielder');
  return {database,env:{DB,BOOKING_LIMITER:{limit:async()=>({success:true})},PUBLIC_API_LIMITER:{limit:async()=>({success:true})},
    PAYPAL_CLIENT_ID:'test-client',PAYPAL_CLIENT_SECRET:'test-secret',PAYPAL_CURRENCY:'USD',PAYPAL_FJD_PER_UNIT:'2',PAYPAL_MODE:'sandbox'}};
}
function request(env,path,body){return worker.fetch(new Request('http://unit.test'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),env)}

test('booking lookup requires the exact reference and normalized email and returns only booking details',async()=>{
  const {database,env}=environment();
  try{
    const created=await request(env,'/api/booking-request',{request_id:'33333333-3333-4333-8333-333333333333',customer_name:'Private Guest',email:'Guest@Example.test',phone:'+6799999999',vehicle_id:'fielder',pickup_at:'2098-03-01T00:00:00.000Z',return_at:'2098-03-03T00:00:00.000Z',payment_option:'deposit'});
    assert.equal(created.status,201,await created.clone().text());
    const booking=await created.json();
    const lookup=await request(env,'/api/booking-lookup',{booking_id:booking.booking_id,email:' guest@example.test '});
    assert.equal(lookup.status,200);
    const result=await lookup.json();
    assert.equal(result.booking.reference,booking.booking_id);
    assert.equal(result.booking.vehicle_name,'Toyota Fielder');
    assert.equal(result.booking.rental_total_fjd,220);
    assert.equal(result.booking.amount_due_fjd_minor,5500);
    assert.equal(JSON.stringify(result).includes('Private Guest'),false);
    assert.equal(JSON.stringify(result).includes('+6799999999'),false);
    const wrongEmail=await request(env,'/api/booking-lookup',{booking_id:booking.booking_id,email:'other@example.test'});
    assert.equal(wrongEmail.status,404);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM bookings').get().n,1);
  }finally{database.close()}
});

