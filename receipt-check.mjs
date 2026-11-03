
import { addCalendarDays, calendarDaysBetween, fijiCurrentDate, fijiLocalDateTimeToIso } from './assets/booking-date-time.js';
let paymentMethods={methods:{bank_transfer:{enabled:false},mpaisa:{enabled:false}}};let activeCheckout=null;
let cars=[
{id:'fielder',name:'Toyota Fielder',category:'Economy',price:110,img:'assets/toyota-fielder.jpg',spec:'Wagon · Details on request',seats:'5 seats (confirm exact vehicle)',features:['Bluetooth availability on request'],fuel:null},
{id:'corolla',name:'Toyota Corolla',category:'Economy',price:115,img:'assets/toyota-corolla.jpg',spec:'Sedan · Details on request',seats:'5 seats (confirm exact vehicle)',features:['Bluetooth availability on request'],fuel:null},
{id:'fit-shuttle',name:'Honda Fit Shuttle',category:'Economy',price:110,img:'assets/honda-fit-shuttle.jpg',spec:'Wagon · Details on request',seats:'5 seats (confirm exact vehicle)',features:['Bluetooth availability on request'],fuel:null},
{id:'ad-wagon',name:'Nissan AD Wagon / Wingroad',category:'Economy',price:115,img:'assets/nissan-ad-wagon.jpg',spec:'Wagon · Details on request',seats:'5 seats (confirm exact vehicle)',features:['Bluetooth availability on request'],fuel:null},
{id:'sportage',name:'Kia Sportage',category:'SUV',price:175,img:'assets/kia-sportage.jpg',spec:'SUV · Details on request',seats:'5 seats (confirm exact vehicle)',features:['Bluetooth availability on request'],fuel:null},
{id:'x-trail',name:'Nissan X-Trail',category:'SUV',price:270,img:'assets/nissan-x-trail.jpg',spec:'SUV · Details on request',seats:'5–7 seats depending on model',features:['Bluetooth availability on request'],fuel:null},
{id:'ranger',name:'Ford Ranger',category:'Pickup',price:490,img:'assets/ford-ranger.jpg',spec:'Pickup · Details on request',seats:'5 seats if double-cab (confirm exact vehicle)',features:['Bluetooth availability on request'],fuel:null}
];
const $=id=>document.getElementById(id);let filter='All',criteria=null,selected=null,bookingRequestId=null,quoteSequence=0,quoteTimer=null;
const money=n=>'FJ$'+Number(n).toLocaleString('en-FJ');
const today=fijiCurrentDate();$('startDate').min=today;$('endDate').min=today;$('startDate').value=today;$('endDate').value=addCalendarDays(today,1);
const initialParams=new URLSearchParams(location.search);
for(const [param,id] of [['start','startDate'],['end','endDate'],['startTime','startTime'],['endTime','endTime']]){const value=initialParams.get(param);if(value&&$(id))$(id).value=value}
for(const [param,id] of [['pickup','pickup'],['dropoff','dropoff']]){const value=initialParams.get(param);if(value&&$(id)&&[...$(id).options].some(o=>o.value===value))$(id).value=value}
$('endDate').min=$('startDate').value||today;
$('startDate').addEventListener('change',()=>{const s=$('startDate').value;$('endDate').min=s;if($('endDate').value<=s){$('endDate').value=addCalendarDays(s,1)}});
function days(){if(!criteria)return 1;return Math.max(1,calendarDaysBetween(criteria.start,criteria.end)||1)}
function esc(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}

function render() {
  const grid = $('fleetGrid');
  if (!grid) return;
  const list = cars.filter(c => filter === 'All' || c.category === filter);
  grid.innerHTML = list.map(c => {
    const availability = window.vehicleAvailability?.[c.id];
    const unavailable = availability === false;
    const featureSummary = (c.features || ['Vehicle features confirmed on request']).slice(0,2).map(esc).join(' · ');
    const stars = c.fuel == null ? '<span class="fuel-rating" aria-label="Fuel economy not yet verified">Fuel economy: <span class="muted-star">☆☆☆☆☆</span> <small>not rated</small></span>' : '<span class="fuel-rating" aria-label="Fuel economy rating">'+'★'.repeat(c.fuel)+'<span class="muted-star">'+'★'.repeat(5-c.fuel)+'</span></span>';
    return `<article class="car" tabindex="0" role="group" aria-label="View ${esc(c.name)} gallery" onclick="openVehicleGallery('${esc(c.id)}')" onkeydown="if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openVehicleGallery('${esc(c.id)}')}">
      <div class="car-img"><img src="${esc(c.img)}" alt="${esc(c.name)} exterior" loading="lazy"></div>
      <div class="car-info"><h3>${esc(c.name)}</h3><div class="rate">${money(c.price)} <small>/ day</small></div>
      <div class="car-spec-icons"><span>👥 ${esc(c.seats||'Seats: confirm')}</span><span>📍 Nadi</span></div><div class="car-featureline">${featureSummary}</div><div class="specs">${stars}</div>
      <button class="btn btn-blue" ${unavailable?'disabled':''} style="${unavailable?'opacity:.5;cursor:not-allowed':''}" onclick="event.stopPropagation();bookCar('${esc(c.id)}')">${unavailable?'Unavailable':'Book Now →'}</button></div></article>`;
  }).join('');
}
window.openVehicleGallery=function(id){const car=cars.find(c=>c.id===id);if(!car)return;window.galleryVehicleId=id;$('galleryTitle').textContent=car.name;$('galleryMain').src=car.img;$('galleryMain').alt=car.name+' exterior reference';$('galleryThumbs').innerHTML=`<button type="button" aria-label="Show exterior photo"><img src="${esc(car.img)}" alt=""></button>`;$('galleryThumbs').querySelector('button').addEventListener('click',()=>$('galleryMain').src=car.img);$('galleryNote').textContent='Interior photos for this exact vehicle have not yet been supplied. Please confirm interior equipment, Bluetooth, Apple CarPlay, Android Auto, reverse camera and other features with Zims before booking.';$('galleryBook').textContent='Book '+car.name+' →';$('galleryBg').classList.add('open');document.body.style.overflow='hidden'};
function closeGallery(){$('galleryBg').classList.remove('open');document.body.style.overflow=''}
$('closeGallery').addEventListener('click',closeGallery);$('galleryBg').addEventListener('click',e=>{if(e.target===$('galleryBg'))closeGallery()});$('galleryBook').addEventListener('click',()=>{const id=window.galleryVehicleId;closeGallery();bookCar(id)});
async function loadPublishedFleet(){try{const r=await fetch('/api/vehicles');if(!r.ok)return;const data=await r.json();if(!Array.isArray(data.vehicles)||!data.vehicles.length)return;cars=data.vehicles.map(v=>{const known=cars.find(c=>c.id===v.id)||{};return {...known,id:v.id,name:v.name,category:/sportage|x-trail/i.test(v.name)?'SUV':/ranger/i.test(v.name)?'Pickup':known.category||'Economy',price:Number(v.daily_rate),depositPercent:v.deposit_percent==null?null:Number(v.deposit_percent),img:v.image_path||known.img,spec:'Details on request'}});render()}catch(e){console.warn('Using built-in fleet until API is configured.',e)}}
async function loadPromotionBanner(){try{const r=await fetch('/api/promotions');if(!r.ok)return;const data=await r.json();const promotion=data.promotions?.[0];if(promotion&&typeof promotion.message==='string'&&promotion.message.trim()){const banner=$('#promo-announcement');banner.textContent=promotion.message;banner.hidden=false}}catch{}}
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),4000)}
document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));render()}));
function dateValid(){if(!$('startDate').value||!$('endDate').value||$('endDate').value<=$('startDate').value){toast('Choose a return date after your pickup date.');return false}return true}
function formatMinor(value){return 'FJ$'+(Number(value||0)/100).toFixed(2)}
function schedulePaymentPreview(){clearTimeout(quoteTimer);quoteTimer=setTimeout(updatePaymentPreview,300)}
function updatePaymentPreview(){if(!selected||!criteria)return;const seq=++quoteSequence,pickup=fijiLocalDateTimeToIso(criteria.start,criteria.startTime),ret=fijiLocalDateTimeToIso(criteria.end,criteria.endTime);$('summary').innerHTML='<strong>'+esc(selected.name)+'</strong><br>'+criteria.start+' '+criteria.startTime+' Fiji local time → '+criteria.end+' '+criteria.endTime+' Fiji local time<br>Pickup: '+esc(criteria.pickup)+'<br>Drop-off: '+esc(criteria.dropoff)+'<br>Duration: '+days()+' day(s)<hr style="border:0;border-top:1px solid #d5e7f5">Checking current server price…';if(!pickup||!ret)return;fetch('/api/booking-quote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({vehicle_id:selected.id,pickup_at:pickup,return_at:ret,email:$('guestEmail').value,discount_code:$('discountCode').value.trim(),payment_option:$('paymentOption').value})}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not calculate this quote.');return data}).then(data=>{if(seq!==quoteSequence)return;const discount=data.discount_type?'<br>'+esc(data.discount_type==='automatic'?'Automatic long-rental discount':'Discount code '+data.discount_reference)+' ('+Number(data.discount_percent)+'%): −'+formatMinor(data.discount_amount_fjd_minor):'<br>Discount: none';$('summary').innerHTML='<strong>'+esc(selected.name)+'</strong><br>'+criteria.start+' '+criteria.startTime+' Fiji local time → '+criteria.end+' '+criteria.endTime+' Fiji local time<br>Pickup: '+esc(criteria.pickup)+'<br>Drop-off: '+esc(criteria.dropoff)+'<br>Duration: '+data.rental_days+' billable day(s)<hr style="border:0;border-top:1px solid #d5e7f5"><strong>Original rental subtotal: '+formatMinor(data.original_subtotal_fjd_minor)+'</strong>'+discount+'<br><strong>Estimated rental total: '+formatMinor(data.rental_total_fjd_minor)+'</strong><br>Amount due before checkout: '+formatMinor(data.amount_due_fjd_minor)+'<br>Remaining balance: '+formatMinor(data.balance_due_fjd_minor)+'<br><small>Server-calculated estimate. The booking request recalculates and saves the final amount. Continue through WhatsApp if online payment is unavailable.</small>'}).catch(error=>{if(seq!==quoteSequence)return;$('summary').innerHTML='<strong>'+esc(selected.name)+'</strong><br>'+criteria.start+' '+criteria.startTime+' Fiji local time → '+criteria.end+' '+criteria.endTime+' Fiji local time<hr style="border:0;border-top:1px solid #d5e7f5"><small>Your vehicle and dates are selected. Contact Zims to confirm the final price and availability before your booking is confirmed.</small>'})}
function bookCar(id){if(activeCheckout){$('guestForm').hidden=true;$('paypalCheckout').hidden=false;$('modalBg').classList.add('show');toast('Finish checkout or contact Zims for booking '+activeCheckout.bookingId+' before starting another booking.');return}if(!dateValid()){$('booking').scrollIntoView({behavior:'smooth'});return}$('guestForm').reset();$('guestForm').hidden=false;$('paypalCheckout').hidden=true;$('checkout-back').textContent='Contact Zims on WhatsApp';$('checkout-back').dataset.mode='contact';criteria={pickup:$('pickup').value,dropoff:$('dropoff').value,start:$('startDate').value,end:$('endDate').value,startTime:$('startTime').value,endTime:$('endTime').value};selected=cars.find(c=>c.id===id);bookingRequestId=crypto.randomUUID();$('discountCode').value='';$('summary').innerHTML='<strong>'+esc(selected.name)+'</strong><br>'+criteria.start+' '+criteria.startTime+' Fiji local time → '+criteria.end+' '+criteria.endTime+' Fiji local time<br><small>Preparing your rental estimate…</small>';const option=$('paymentOption'),deposit=option.querySelector('option[value="deposit"]');if(selected.depositPercent!=null){deposit.disabled=false;deposit.textContent='Pay deposit ('+selected.depositPercent+'%)'}else{deposit.disabled=true;deposit.textContent='Deposit not configured';option.value='full'}updatePaymentPreview();$('modalBg').classList.add('show')}
$('guestPhoneCode').addEventListener('change',()=>{const other=$('guestPhoneCode').value==='+other';const custom=$('guestPhoneCustomCode');custom.hidden=!other;custom.required=other;custom.closest('.phone-entry').classList.toggle('custom-code-active',other);$('guestPhone').placeholder='Phone number';$('guestPhone').setAttribute('autocomplete',other?'tel':'tel-national');if(other)custom.focus()});
$('paymentOption').addEventListener('change',schedulePaymentPreview);
$('discountCode').addEventListener('input',schedulePaymentPreview);
$('guestEmail').addEventListener('input',schedulePaymentPreview);

window.bookCar=bookCar;

$('searchForm').addEventListener('submit', async e => {
  e.preventDefault();

  if (!dateValid()) return;

  criteria = {
    pickup: $('pickup').value,
    dropoff: $('dropoff').value,
    start: $('startDate').value,
    end: $('endDate').value,
    startTime: $('startTime').value,
    endTime: $('endTime').value
  };

  const btn = $('searchForm').querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Checking availability…';

  try {
    const pickupAt = fijiLocalDateTimeToIso(criteria.start, criteria.startTime);
    const returnAt = fijiLocalDateTimeToIso(criteria.end, criteria.endTime);

    if (!pickupAt || !returnAt || Date.parse(returnAt) <= Date.parse(pickupAt)) {
      toast('Choose valid pickup and return times in Fiji, with return after pickup.');
      return;
    }

    const results = await Promise.all(
      cars.map(async car => {
        const response = await fetch('/api/availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicle_id: car.id,
            pickup_at: pickupAt,
            return_at: returnAt
          })
        });

        if (!response.ok) {
          throw new Error('Could not check availability.');
        }

        const result = await response.json();

        return {
          name: car.name,
          available: result.available
        };
      })
    );

    const availableIds = results.filter(car => car.available)
      .map(car => cars.find(vehicle => vehicle.name === car.name)?.id)
      .filter(Boolean);
    const params = new URLSearchParams({
      start: criteria.start, end: criteria.end,
      startTime: criteria.startTime, endTime: criteria.endTime,
      pickup: criteria.pickup, dropoff: criteria.dropoff,
      available: availableIds.join(',')
    });
    // Fleet browsing lives on its own page; carry the selected dates forward.
    location.href = 'fleet.html?' + params.toString();
    return;
  } catch (error) {
    console.error('Availability check failed:', error);
    toast('Could not check availability. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Search Vehicles →';
  }
});

$('bookTab').addEventListener('click',()=>{$('bookTab').classList.add('active');$('manageTab').classList.remove('active');$('bookPane').style.display='block';$('managePane').style.display='none'});$('manageTab').addEventListener('click',()=>{$('manageTab').classList.add('active');$('bookTab').classList.remove('active');$('bookPane').style.display='none';$('managePane').style.display='block'});
const mobileMenuToggle=$('mobileMenuToggle'),mobileNav=$('mobileNav');mobileMenuToggle.addEventListener('click',()=>{const opening=mobileNav.hidden;mobileNav.hidden=!opening;mobileMenuToggle.setAttribute('aria-expanded',String(opening));mobileMenuToggle.setAttribute('aria-label',opening?'Close navigation':'Open navigation');mobileMenuToggle.textContent=opening?'×':'☰'});mobileNav.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{mobileNav.hidden=true;mobileMenuToggle.setAttribute('aria-expanded','false');mobileMenuToggle.setAttribute('aria-label','Open navigation');mobileMenuToggle.textContent='☰'}));document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('galleryBg').classList.contains('open'))closeGallery();if(event.key==='Escape'&&!mobileNav.hidden){mobileNav.hidden=true;mobileMenuToggle.setAttribute('aria-expanded','false');mobileMenuToggle.setAttribute('aria-label','Open navigation');mobileMenuToggle.textContent='☰'}});
$('manageForm').addEventListener('submit',async e=>{e.preventDefault();const result=$('manageResult');result.hidden=false;result.replaceChildren();const submit=$('manageForm').querySelector('button[type=submit]');submit.disabled=true;submit.textContent='Looking up booking…';try{const response=await fetch('/api/booking-lookup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({booking_id:$('bookingRef').value.trim(),email:$('manageEmail').value.trim()})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not look up booking');const b=data.booking;const lines=[['Reference',b.reference],['Vehicle',b.vehicle_name],['Pickup',new Intl.DateTimeFormat('en-FJ',{timeZone:'Pacific/Fiji',dateStyle:'medium',timeStyle:'short'}).format(new Date(b.pickup_at))+' Fiji time'],['Return',new Intl.DateTimeFormat('en-FJ',{timeZone:'Pacific/Fiji',dateStyle:'medium',timeStyle:'short'}).format(new Date(b.return_at))+' Fiji time'],['Booking status',b.hold_expired?'Payment hold expired':b.status.replaceAll('_',' ')],['Payment status',b.payment_status.replaceAll('_',' ')],['Rental total','FJ$'+Number(b.rental_total_fjd).toFixed(2)],['Amount due','FJ$'+(Number(b.amount_due_fjd_minor)/100).toFixed(2)],['Remaining balance','FJ$'+(Number(b.balance_due_fjd_minor)/100).toFixed(2)]];for(const [label,value] of lines){const line=document.createElement('p');line.style.margin='6px 0';const strong=document.createElement('strong');strong.textContent=label+': ';line.append(strong,document.createTextNode(value));result.append(line)}if(b.payment_status==='paid'||b.payment_status==='deposit_paid'){}const contact=document.createElement('a');contact.className='btn btn-outline';contact.href='https://wa.me/6799042101?text='+encodeURIComponent('Hello Zims, I need help with booking '+b.reference+'.');contact.target='_blank';contact.rel='noopener';contact.textContent='Contact Zims about this booking';result.append(contact);const dlBtn=document.createElement('button');dlBtn.className='btn btn-blue';dlBtn.textContent='Download Receipt';dlBtn.style.cssText='display:block;width:100%;margin-top:10px';dlBtn.addEventListener('click',()=>{showReceipt({bookingId:b.reference,customerName:'',email:$('manageEmail').value.trim(),phone:'',vehicleName:b.vehicle_name,pickupAt:b.pickup_at,returnAt:b.return_at,days:0,dailyRate:0,originalSubtotal:0,discountType:null,discountReference:null,discountPercent:0,discountAmount:0,rentalTotal:Number(b.rental_total_fjd)*100,paymentOption:b.payment_option,depositPercent:null,amountDue:b.amount_due_fjd_minor,balanceDue:b.balance_due_fjd_minor,status:b.hold_expired?'pending_payment':b.status,paymentStatus:b.payment_status,holdExpiresAt:b.hold_expires_at,paymentMethod:null,paymentInstructions:''});});result.append(dlBtn)}catch(error){const message=document.createElement('p');message.textContent=error.message;result.append(message);const contact=document.createElement('a');contact.className='btn btn-outline';contact.href='https://wa.me/6799042101?text='+encodeURIComponent('Hello Zims, I need help checking a booking. Reference: '+$('bookingRef').value.trim()+'; Email: '+$('manageEmail').value.trim());contact.target='_blank';contact.rel='noopener';contact.textContent='Ask Zims on WhatsApp';result.append(contact)}finally{submit.disabled=false;submit.textContent='Look Up Booking →'}});
$('closeModal').addEventListener('click',()=>$('modalBg').classList.remove('show'));$('modalBg').addEventListener('click',e=>{if(e.target===$('modalBg'))$('modalBg').classList.remove('show')});
async function loadSiteSettings(){try{const response=await fetch('/api/site-settings');if(!response.ok)return;const data=await response.json();const settings=data.settings||{};for(const [key,value] of Object.entries(settings)){if(typeof value!=='string')continue;if(key==='about_brochure_mode'){const showImage=value!=='text';$('aboutBrochureVisual').hidden=!showImage;$('aboutTextOnly').hidden=showImage;continue}if(key==='about_brochure_image_url'||key==='business_logo_url'){const selector=key==='about_brochure_image_url'?'#aboutBrochureImage':'[data-site-setting-src="business_logo_url"]';document.querySelectorAll(selector).forEach(image=>{const v=value.trim();if(/^https:\/\//i.test(v)||v.startsWith('assets/')||v.startsWith('/assets/'))image.src=v});continue}document.querySelectorAll('[data-site-setting="'+CSS.escape(key)+'"]').forEach(node=>{node.textContent=value});document.querySelectorAll('[data-site-setting-href="'+CSS.escape(key)+'"]').forEach(node=>{const v=value.trim();if(!v)return;if(key==='business_email')node.href='mailto:'+v;else if(key==='business_phone')node.href='tel:'+v.replace(/[^+0-9]/g,'');else if(key==='business_whatsapp'){const digits=v.replace(/\D/g,'');if(digits.length>=7)node.href='https://wa.me/'+digits}else if(['business_facebook','business_map_url'].includes(key)&&/^https:\/\//i.test(v))node.href=v});if(key==='business_map_url'&&/^https:\/\//i.test(value.trim())){document.querySelectorAll('[data-site-setting-map]').forEach(frame=>{const address=String(settings.business_address||'Lot 1, Backroad Nadi, Fiji').trim();frame.src='https://maps.google.com/maps?q='+encodeURIComponent(address)+'&t=&z=16&ie=UTF8&iwloc=&output=embed'})}}}catch{/* Built-in copy remains visible if the settings table is not configured yet. */}}

async function loadPaymentMethods(){const select=$('paymentMethod'),notice=$('checkout-notice'),button=$('booking-submit-button');try{const response=await fetch('/api/payment-methods');const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load payment methods');paymentMethods=data;select.replaceChildren();const available=[];if(data.methods?.bank_transfer?.enabled)available.push(['bank_transfer','Bank transfer']);if(data.methods?.mpaisa?.enabled)available.push(['mpaisa','M-PAiSA']);if(!available.length){select.add(new Option('No online payment methods available',''));notice.textContent='Online payments are not configured yet. You can still contact Zims on WhatsApp to request a booking.';button.textContent='Contact Zims on WhatsApp';button.disabled=false;return}for(const [value,label] of available)select.add(new Option(label,value));select.value=available[0][0];notice.textContent='Your vehicle will be held for 15 minutes while you complete payment setup. Manual payments stay pending until the owner verifies the transaction.';button.textContent='Create temporary hold';button.disabled=false;select.onchange=()=>{button.textContent='Create temporary hold';notice.textContent='Your vehicle will be held for up to 15 minutes while you switch to your payment app. Submit your transaction reference before the hold expires.'}}catch{paymentMethods={methods:{bank_transfer:{enabled:false},mpaisa:{enabled:false}}};select.replaceChildren(new Option('Contact Zims on WhatsApp','contact'));button.textContent='Contact Zims on WhatsApp';button.disabled=false;notice.textContent='Payment methods could not be loaded. Contact Zims to arrange a booking.'}}

function fullGuestPhone(){const selectedCode=$('guestPhoneCode')?.value||'+679';const code=selectedCode==='+other'?$('guestPhoneCustomCode').value.trim():selectedCode;const local=$('guestPhone').value.trim();return (code+' '+local).trim()}
function bookingWhatsappMessage(){return ['Zims Rental Cars Nadi — booking enquiry','Vehicle: '+(selected?.name||'Not selected'),'Pickup: '+criteria.start+' '+criteria.startTime+' Fiji time','Return: '+criteria.end+' '+criteria.endTime+' Fiji time','Pickup location: '+criteria.pickup,'Drop-off location: '+criteria.dropoff,'Name: '+$('guestName').value.trim(),'Email: '+$('guestEmail').value.trim(),'Phone: '+fullGuestPhone().trim(),'Discount code: '+($('discountCode').value.trim()||'None'),'Payment preference: '+$('paymentOption').selectedOptions[0].textContent,'Quote summary: '+$('summary').innerText.replace(/\s+/g,' ').trim(),'Extra request: '+$('extra').value].join('\n')}


$('checkout-back').addEventListener('click',()=>{const mode=$('checkout-back').dataset.mode;if(mode==='close'){$('modalBg').classList.remove('show');$('paypalCheckout').hidden=true;$('guestForm').hidden=false;return}const text='Hello Zims, I need help with checkout.\nBooking reference: '+(activeCheckout?.bookingId||'Not available')+'\nEmail: '+(activeCheckout?.email||$('guestEmail').value.trim());window.open('https://wa.me/6799042101?text='+encodeURIComponent(text),'_blank','noopener')});
$('guestForm').addEventListener('submit',async e=>{e.preventDefault();const btn=$('booking-submit-button');if(!selected||!criteria)return;if(!dateValid())return;const paymentMethod=$('paymentMethod').value;if(!paymentMethod||paymentMethod==='contact'){const message=bookingWhatsappMessage();window.open('https://wa.me/6799042101?text='+encodeURIComponent(message),'_blank','noopener');$('modalBg').classList.remove('show');toast('No booking hold was created. Send the prepared WhatsApp enquiry to request a booking.');return}btn.disabled=true;btn.textContent='Creating temporary hold…';try{const pickup=fijiLocalDateTimeToIso(criteria.start,criteria.startTime);const ret=fijiLocalDateTimeToIso(criteria.end,criteria.endTime);if(!pickup||!ret||Date.parse(ret)<=Date.parse(pickup))throw new Error('Choose valid pickup and return times in Fiji, with return after pickup.');bookingRequestId ||= crypto.randomUUID();const email=$('guestEmail').value.trim();const response=await fetch('/api/booking-request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({request_id:bookingRequestId,customer_name:$('guestName').value,email,phone:fullGuestPhone(),vehicle_id:selected.id,pickup_at:pickup,return_at:ret,notes:$('extra').value,payment_option:$('paymentOption').value,payment_method:paymentMethod,discount_code:$('discountCode').value.trim()||undefined})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not create booking request');bookingRequestId=null;activeCheckout={bookingId:data.booking_id,email,amountDueMinor:Number(data.amount_due_fjd_minor),balanceDueMinor:Number(data.balance_due_fjd_minor),paymentMethod:data.payment_method||paymentMethod};$('checkout-reference').textContent='Booking reference: '+data.booking_id;$('checkout-amount').textContent='Amount due now: FJ$'+(Number(data.amount_due_fjd_minor)/100).toFixed(2)+' · Remaining balance: FJ$'+(Number(data.balance_due_fjd_minor)/100).toFixed(2);$('guestForm').hidden=true;$('paypalCheckout').hidden=false;$('manualPaymentPanel').hidden=false;{const method=paymentMethods.methods[activeCheckout.paymentMethod];$('manual-payment-title').textContent=activeCheckout.paymentMethod==='bank_transfer'?'Bank transfer details':'M-PAiSA payment details';$('manual-payment-instructions').replaceChildren();$('manualPaymentForm').reset();$('transactionReference').disabled=false;$('manual-payment-submit').disabled=false;$('manual-payment-submit').textContent='Submit reference & request booking';$('manual-payment-result').hidden=true;const lines=[];if(activeCheckout.paymentMethod==='bank_transfer'){lines.push(['Bank',method.bank_name],['Account name',method.account_name],['Account number',method.account_number],['Branch',method.branch])}else{lines.push(['Recipient',method.recipient_name],['M-PAiSA mobile number',method.mobile_number]);if(method.qr_image_url){const qr=document.createElement('img');qr.src=method.qr_image_url;qr.alt='M-PAiSA payment QR code';qr.loading='lazy';qr.style.cssText='display:block;max-width:220px;max-height:220px;object-fit:contain;margin:12px auto';$('manual-payment-instructions').append(qr)}}for(const [label,value] of lines){if(!value)continue;const line=document.createElement('p');line.style.margin='6px 0';const strong=document.createElement('strong');strong.textContent=label+': ';line.append(strong,document.createTextNode(value));$('manual-payment-instructions').append(line)}const instructions=document.createElement('p');instructions.textContent=method.instructions||'Use your banking app to make the payment, then return here and submit the transaction reference.';$('manual-payment-instructions').append(instructions);$('checkout-hold-note').textContent='Your vehicle is held for up to 15 minutes while you switch apps and make the payment. After reference submission, the hold extends to 24 hours for owner review.'}
showReceipt({bookingId:data.booking_id,customerName:$('guestName').value,email,phone:fullGuestPhone(),vehicleName:selected.name,pickupAt:pickup,returnAt:ret,days:data.rental_days,dailyRate:Number(data.daily_rate_fjd_minor)/100,originalSubtotal:data.original_subtotal_fjd_minor,discountType:data.discount_type,discountReference:data.discount_reference,discountPercent:data.discount_percent,discountAmount:data.discount_amount_fjd_minor||0,rentalTotal:data.rental_total_fjd_minor,paymentOption:data.payment_option||$('paymentOption').value,depositPercent:data.deposit_percent_snapshot,amountDue:data.amount_due_fjd_minor,balanceDue:data.balance_due_fjd_minor,status:data.status||'pending_payment',paymentStatus:'pending',holdExpiresAt:data.hold_expires_at,paymentMethod:activeCheckout.paymentMethod,paymentInstructions:$('manual-payment-instructions').innerHTML});}catch(err){if(activeCheckout){$('checkout-amount').textContent='Checkout could not finish: '+err.message+'. Your temporary hold remains active until it expires. Do not submit a second booking; contact Zims using the button below.';$('checkout-back').textContent='Contact Zims on WhatsApp';$('checkout-back').dataset.mode='contact';$('guestForm').hidden=true;$('paypalCheckout').hidden=false}else{toast(err.message+' If payment is unavailable, contact Zims on WhatsApp.')}}finally{btn.disabled=false;btn.textContent='Create temporary hold'}});
$('manualPaymentForm').addEventListener('submit',async e=>{e.preventDefault();if(!activeCheckout||!['bank_transfer','mpaisa'].includes(activeCheckout.paymentMethod))return;const button=$('manual-payment-submit'),result=$('manual-payment-result');button.disabled=true;button.textContent='Submitting reference…';try{const response=await fetch('/api/manual-payment/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({booking_id:activeCheckout.bookingId,email:activeCheckout.email,transaction_reference:$('transactionReference').value.trim()})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not submit payment reference');result.hidden=false;result.textContent='Reference submitted. Your booking is pending owner review and is not confirmed yet. Your vehicle hold has been extended for up to 24 hours.';$('transactionReference').disabled=true;button.textContent='Reference submitted';$('checkout-back').textContent='Contact Zims on WhatsApp';$('checkout-back').dataset.mode='contact';toast('Payment reference submitted for owner review.')}catch(error){result.hidden=false;result.textContent=error.message;button.disabled=false;button.textContent='Submit reference & request booking'}});

function initContactCarAnimations() {
  const carSvg = '<svg viewBox="0 0 60 28" aria-hidden="true"><path d="M7 17 11 9.5Q12 7 16 7h23q4 0 6 4l3 5h4q3 0 3 3v3H5v-3q0-2 2-2Z" fill="#111"/><path d="M15 9.5h10v6H12.5Z M28 9.5h10q3 0 4.5 3l1.2 3H28Z" fill="#d9e9f5"/><circle cx="15" cy="23" r="4" fill="#111"/><circle cx="44" cy="23" r="4" fill="#111"/></svg>';

  document.querySelectorAll('.contact-half').forEach(row => {
    const button = row.querySelector('.btn');
    const text = row.querySelector('p');
    if (!button || !text) return;

    let car = row.querySelector('.contact-car');
    if (!car) {
      car = document.createElement('span');
      car.className = 'contact-car';
      car.setAttribute('aria-hidden', 'true');
      car.innerHTML = carSvg;
      row.appendChild(car);
    }

    function drive() {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const rowRect = row.getBoundingClientRect();
      const textRect = text.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();

      // Measure the actual rendered text, not the full paragraph box.
      const range = document.createRange();
      range.selectNodeContents(text);
      const textEndRect = range.getBoundingClientRect();

      const startX = Math.max(0, textEndRect.right - rowRect.left + 8);
      const endX = buttonRect.left - rowRect.left - 50;
      const y = textRect.top - rowRect.top +
        (textRect.height - 22) / 2;

      // Skip if there isn't enough horizontal space for the car.
      if (endX <= startX + 10) return;

      row.style.setProperty('--car-start-x', `${startX}px`);
      row.style.setProperty('--car-start-y', `${y}px`);
      row.style.setProperty('--car-end-x', `${endX}px`);
      row.style.setProperty('--car-end-y', `${y}px`);

      row.classList.remove('is-driving');
      void car.offsetWidth;
      row.classList.add('is-driving');
    }

    button.addEventListener('mouseenter', drive);
    button.addEventListener('focus', drive);
    button.addEventListener('mouseleave', () => row.classList.remove('is-driving'));
    button.addEventListener('blur', () => row.classList.remove('is-driving'));
  });
}

initContactCarAnimations();

function initScrollReveals() {
  const carSvg = '<svg viewBox="0 0 60 28" aria-hidden="true" focusable="false"><path d="M7 17 11 9.5Q12 7 16 7h23q4 0 6 4l3 5h4q3 0 3 3v3H5v-3q0-2 2-2Z" fill="#101820"/><path d="M15 9.5h10v6H12.5Z M28 9.5h10q3 0 4.5 3l1.2 3H28Z" fill="#d9e9f5"/><circle cx="15" cy="23" r="4" fill="#101820" stroke="#fff" stroke-width="1.2"/><circle cx="44" cy="23" r="4" fill="#101820" stroke="#fff" stroke-width="1.2"/></svg>';
  const navLinks = [...document.querySelectorAll('[data-nav-target]')];
  navLinks.forEach(link => {
    if (!link.querySelector('.nav-car-indicator')) {
      const icon = document.createElement('span');
      icon.className = 'nav-car-indicator';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = carSvg;
      link.prepend(icon);
    }
  });
  const navTargets = [...new Map(navLinks.map(link => {
    const target = document.querySelector(link.dataset.navTarget);
    return target ? [link.dataset.navTarget, target] : null;
  }).filter(Boolean)).entries()].map(([selector, target]) => ({selector, target}));
  const setActive = selector => navLinks.forEach(link => {
    const active = link.dataset.navTarget === selector;
    link.classList.toggle('active-section', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  if ('IntersectionObserver' in window && navTargets.length) {
    const activeObserver = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio-a.intersectionRatio)[0];
      if (visible) setActive('#' + visible.target.id);
    }, {rootMargin:'-22% 0px -62% 0px', threshold:[0,.1,.25,.5]});
    navTargets.forEach(item => activeObserver.observe(item.target));
  }
  navLinks.forEach(link => link.addEventListener('click', () => setActive(link.dataset.navTarget)));

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sections = document.querySelectorAll('.hero, .services-band, .section[id]');
  const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    revealObserver.unobserve(entry.target);
  }), {threshold:.12, rootMargin:'0px 0px -24px 0px'});
  sections.forEach(section => {section.classList.add('reveal'); revealObserver.observe(section)});
  document.documentElement.classList.add('motion-ready');
}

 initScrollReveals();
 $('year').textContent=new Date().getFullYear();render();loadPublishedFleet();loadPromotionBanner();const requestedVehicle=new URLSearchParams(location.search).get('vehicle');if(requestedVehicle){setTimeout(()=>{if(cars.some(c=>c.id===requestedVehicle))bookCar(requestedVehicle)},250)}let receiptData=null;
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
else if(isConfirmed&&isPaidFull)st='Confirmed \u2014 Paid in Full';
else if(isConfirmed&&isDepositPaid)st='Confirmed \u2014 Deposit Paid';
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
discountRow='<div class="receipt-row"><span class="receipt-label">Discount ('+dl+', '+d.discountPercent+'%)</span><span class="receipt-value receipt-discount">\u2212'+formatFjdMinor(d.discountAmount)+'</span></div>'}
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

loadPaymentMethods();loadSiteSettings();
