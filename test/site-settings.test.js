import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

function environment(){
 const database=new DatabaseSync(':memory:');
 const migrations=['initial','seed_vehicles','booking_holds','booking_cancellation','booking_payment_snapshots','promotional_banners','booking_discounts','manual_payment_review','expand_site_settings','vehicle_fleet_quantity'];
 migrations.forEach((name,i)=>database.exec(readFileSync(new URL(`../migrations/${String(i+1).padStart(4,'0')}_${name}.sql`,import.meta.url),'utf8')));
 const DB={prepare(sql){let values=[];const statement={bind(...v){values=v;return statement},async first(){return database.prepare(sql).get(...values)??null},async all(){return {results:database.prepare(sql).all(...values)}},async run(){const r=database.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}}}};return statement},async batch(statements){database.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());database.exec('COMMIT');return result}catch(error){database.exec('ROLLBACK');throw error}}};
 return {database,env:{DB,ADMIN_EMAIL:'owner@example.test',ADMIN_PASSWORD:'test-owner-password',SESSION_SECRET:'site-settings-test-session-secret',LOGIN_IP_LIMITER:{limit:async()=>({success:true})},LOGIN_ACCOUNT_LIMITER:{limit:async()=>({success:true})},PUBLIC_API_LIMITER:{limit:async()=>({success:true})}}};
}
async function request(env,path,{method='GET',body,cookie}={}){const headers={};if(body!==undefined)headers['content-type']='application/json';if(cookie)headers.cookie=cookie;return worker.fetch(new Request('http://unit.test'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),env)}

test('owner can edit allowlisted website copy and public page receives it as plain text',async()=>{
 const {database,env}=environment();
 try{
  const unauthorized=await request(env,'/api/admin/site-settings');assert.equal(unauthorized.status,401);
  const login=await request(env,'/api/login',{method:'POST',body:{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD}});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const saved=await request(env,'/api/admin/site-settings',{method:'PUT',cookie,body:{settings:{hero_subtitle:'A custom Fiji escape <script>alert(1)</script>',about_heading:'Welcome'}}});assert.equal(saved.status,200);
  const publicSettings=await request(env,'/api/site-settings');assert.equal(publicSettings.status,200);const data=await publicSettings.json();assert.equal(data.settings.hero_subtitle,'A custom Fiji escape <script>alert(1)</script>');assert.equal(data.settings.about_heading,'Welcome');
  const contactSaved=await request(env,'/api/admin/site-settings',{method:'PUT',cookie,body:{settings:{business_name:'Zims Rental Cars',business_phone:'+679 9042101',business_email:'zimsrentalfj@gmail.com',business_whatsapp:'+679 9042101',business_facebook:'https://www.facebook.com/zimsfiji',business_map_url:'https://maps.google.com/?q=Lot+1+Backroad+Nadi',airport_pickup_text:'Airport pickup available by arrangement'}}});
  assert.equal(contactSaved.status,200);

  const contactResponse=await request(env,'/api/site-settings');
  const contactData=await contactResponse.json();
  assert.equal(contactData.settings.business_name,'Zims Rental Cars');
  assert.equal(contactData.settings.business_phone,'+679 9042101');
  assert.equal(contactData.settings.business_email,'zimsrentalfj@gmail.com');

  const invalid=await request(env,'/api/admin/site-settings',{method:'PUT',cookie,body:{settings:{admin_password:'not allowed'}}});
  assert.equal(invalid.status,400);

  const invalidUrl=await request(env,'/api/admin/site-settings',{method:'PUT',cookie,body:{settings:{business_facebook:'javascript:alert(1)'}}});
  assert.equal(invalidUrl.status,400);

  const invalidEmail=await request(env,'/api/admin/site-settings',{method:'PUT',cookie,body:{settings:{business_email:'not-an-email'}}});
  assert.equal(invalidEmail.status,400);

  const rows=database.prepare('SELECT COUNT(*) AS n FROM site_settings').get();
  assert.equal(rows.n,9);
 }finally{database.close()}
});
