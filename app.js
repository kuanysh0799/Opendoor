// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Подключаем твой конфиг
import { firebaseConfig } from './firebase-config.js';

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Вход через Google
const provider = new GoogleAuthProvider();
document.getElementById("loginBtn").addEventListener("click", () => {
    signInWithPopup(auth, provider)
      .then((result) => {
          const user = result.user;
          console.log("Успешный вход:", user);
          document.body.innerHTML += `<p>Добро пожаловать, ${user.displayName}</p>`;
      })
      .catch((error) => {
          console.error("Ошибка входа:", error);
      });
});

// helpers
const $=(s,e=document)=>e.querySelector(s); const $$=(s,e=document)=>Array.from(e.querySelectorAll(s));
const money = n => new Intl.NumberFormat('ru-RU').format(Number(n||0))+' ₸';

// theme
const key='od_theme'; function apply(t){ document.documentElement.classList.toggle('light', t==='light'); $('#themeToggle').textContent = t==='light'?'🌞':'🌙'; localStorage.setItem(key,t); }
apply(localStorage.getItem(key)||'dark'); $('#themeToggle').onclick=()=>apply(document.documentElement.classList.contains('light')?'dark':'light');

// Tabs
const tabBtns=$$('.tabs button'); tabBtns.forEach(b=> b.onclick=()=>{ tabBtns.forEach(x=>x.classList.toggle('active',x===b)); render(b.dataset.screen); });
function render(name){ $('#app').innerHTML=''; $('#app').appendChild(SCREENS[name]()); }

// Sheet + form
const sheet = $('#sheet'); const openSheet=(data=null)=>{ $('#sheetTitle').textContent=data?'Редактировать сделку':'Новая сделка'; clearForm(); if(data) fillForm(data); sheet.classList.add('show'); sheet.classList.remove('hidden'); }
const closeSheet=()=>{ sheet.classList.remove('show'); setTimeout(()=>sheet.classList.add('hidden'),200); };
$('#sheetClose').onclick=closeSheet; $('#fab').onclick=()=>openSheet();
$('#addItem').onclick=()=>addItemRow(); $('#saveDeal').onclick=()=>saveDeal();

function clearForm(){ ['fName','fPhone','fAddress','fDate','fTime'].forEach(id=>$('#'+id).value=''); $('#fSource').value='Instagram'; $('#items').innerHTML=''; addItemRow(); updateTotalsUI(); }
function fillForm(d){ $('#fName').value=d.customer?.name||''; $('#fPhone').value=d.customer?.phone||''; $('#fAddress').value=d.customer?.address||''; $('#fSource').value=d.customer?.source||'Instagram'; $('#fDate').value=d.delivery?.date||''; $('#fTime').value=d.delivery?.time||''; $('#items').innerHTML=''; (d.items||[]).forEach(i=>addItemRow(i)); updateTotalsUI(); }
function addItemRow(i={title:'',qty:1,price:0,cost:0}){ const row=document.createElement('div'); row.className='item'; row.innerHTML=`
  <input class="input t" placeholder="Название" value="${i.title||''}">
  <input class="input q" type="number" min="1" value="${i.qty||1}">
  <input class="input p" type="number" min="0" value="${i.price||0}">
  <input class="input c" type="number" min="0" value="${i.cost||0}">
  <button class="del">✕</button>`;
  row.querySelectorAll('.t,.q,.p,.c').forEach(inp=> inp.oninput=updateTotalsUI);
  row.querySelector('.del').onclick=()=>{ row.remove(); updateTotalsUI(); };
  $('#items').appendChild(row);
}
function items(){ return $$('.item').map(r=>({ title:r.querySelector('.t').value||'Товар', qty:Number(r.querySelector('.q').value||1), price:Number(r.querySelector('.p').value||0), cost:Number(r.querySelector('.c').value||0) })); }
function sum(){ const it=items(); const revenue=it.reduce((s,i)=>s+i.qty*i.price,0); const cost=it.reduce((s,i)=>s+i.qty*i.cost,0); const margin=revenue-cost; const mperc=revenue?Math.round((margin/revenue)*1000)/10:0; return {revenue,cost,margin,mperc}; }
function updateTotalsUI(){ const t=sum(); $('#totals').innerHTML=`<span class="pill">Выручка: ${money(t.revenue)}</span><span class="pill">Себестоимость: ${money(t.cost)}</span><span class="pill">Маржа: ${money(t.margin)} (${t.mperc}%)</span>`; }

async function saveDeal(){
  if(!auth.currentUser) return alert('Сначала войдите');
  if(!$('#fName').value.trim() || !$('#fPhone').value.trim()) return alert('Укажите имя и телефон');
  const it=items(); const t=sum();
  await addDoc(collection(db,'deals'), {
    stage:'Лид',
    customer:{name:$('#fName').value.trim(), phone:$('#fPhone').value.trim(), address:$('#fAddress').value.trim(), source:$('#fSource').value},
    delivery:{date:$('#fDate').value, time:$('#fTime').value},
    items: it, totals:t, managerUid: auth.currentUser.uid, createdAt: serverTimestamp()
  });
  closeSheet();
}

// Auth
$('#btnLogin').onclick=()=>signInWithPopup(auth, provider);
$('#btnLogout').onclick=()=>signOut(auth);

let currentRole='manager';
onAuthStateChanged(auth, async (user)=>{
  if(!user){ $('#btnLogin').style.display='inline-block'; $('#btnLogout').style.display='none'; $('#tabUsers').style.display='none'; $('#app').innerHTML='<div class="card"><h3>Войдите через Google</h3><div class="kb">Так CRM подключится к общей базе Firestore.</div></div>'; return; }
  $('#btnLogin').style.display='none'; $('#btnLogout').style.display='inline-block';
  // user doc
  const uref=doc(db,'users',user.uid); const snap=await getDoc(uref);
  if(!snap.exists()) await setDoc(uref,{name:user.displayName||'', email:user.email||'', role:'manager', createdAt: serverTimestamp()});
  currentRole = (await getDoc(uref)).data().role||'manager';
  $('#tabUsers').style.display = currentRole==='owner'?'block':'none';
  render($('.tabs .active').dataset.screen||'pipeline');
});

// Screens
const SCREENS={};
SCREENS.pipeline = () => {
  const wrap=document.createElement('div');
  wrap.appendChild(Object.assign(document.createElement('div'),{className:'kb',textContent:'Свайпы: ← КП • → След. этап • Долгое — WhatsApp'}));
  onSnapshot(collection(db,'deals'),(snap)=>{
    wrap.innerHTML = '<div class="kb">Свайпы: ← КП • → След. этап • Долгое — WhatsApp</div>';
    snap.forEach(dref=>{
      const d=dref.data();
      const card=document.createElement('div'); card.className='card';
      card.innerHTML=`<div class="row" style="justify-content:space-between">
        <div><h3 style="margin:0 0 4px 0">${d.customer?.name||'Клиент'}</h3>
        <div class="kb">${d.customer?.phone||''} • ${d.customer?.address||''} • ${d.customer?.source||''}</div></div>
        <div class="badge">${d.stage||'Лид'}</div></div>
        <div class="row" style="margin-top:8px">
          <div class="stage">Выручка: ${money(d.totals?.revenue)}</div>
          <div class="stage">Маржа: ${money(d.totals?.margin)} (${d.totals?.mperc||0}%)</div>
        </div>`;
      attachSwipe(card,{
        left:()=>openQuote(d),
        right:()=>nextStage(dref.id, d.stage||'Лид'),
        long:()=>openWhatsApp(d)
      });
      wrap.appendChild(card);
    });
  });
  return wrap;
};
SCREENS.deals = () => {
  const el=document.createElement('div');
  onSnapshot(collection(db,'deals'),(snap)=>{
    const out=[]; snap.forEach(d=>{ const x=d.data(); out.push(`<div class="card"><div class="row" style="justify-content:space-between"><div><strong>${x.customer?.name||'Клиент'}</strong><div class="kb">${x.customer?.phone||''}</div></div><div class="badge">${x.stage||'Лид'}</div></div></div>`); });
    el.innerHTML = out.join('') || '<div class="kb">Сделок пока нет</div>';
  });
  return el;
};
SCREENS.clients = () => {
  const el=document.createElement('div'); onSnapshot(collection(db,'deals'),(snap)=>{
    const map=new Map(); snap.forEach(d=>{ const x=d.data(); const k=x.customer?.phone||x.customer?.name; if(!map.has(k)) map.set(k,x.customer); });
    el.innerHTML = [...map.values()].map(c=>`<div class="card"><strong>${c?.name||''}</strong><div class="kb">${c?.phone||''} • ${c?.source||''}</div></div>`).join('') || '<div class="kb">Клиенты появятся после первых сделок</div>';
  }); return el;
};
SCREENS.tasks = () => { const el=document.createElement('div'); el.innerHTML='<div class="card"><h3>Задачи</h3><div class="kb">Напоминания о доставке/установке добавим следующим шагом</div></div>'; return el; };
SCREENS.reports = () => {
  const el=document.createElement('div'); const b=document.createElement('button'); b.className='btn primary'; b.textContent='Экспорт в Excel'; b.onclick=exportExcel; el.appendChild(b); return el;
};
SCREENS.settings = () => { const el=document.createElement('div'); el.innerHTML='<div class="card"><h3>Настройки</h3><div class="kb">Темная/светлая тема и офлайн включены</div></div>'; return el; };
SCREENS.users = () => { const el=document.createElement('div'); if(currentRole!=='owner'){ el.innerHTML='<div class="card"><h3>Доступ только для владельца</h3></div>'; return el;} el.innerHTML='<div class="card"><h3>Сотрудники</h3><div class="kb">Роли назначаются в коллекции users</div></div>'; return el; };

// Stage, WhatsApp, Quote
async function nextStage(id, stage){
  const flow=['Лид','Контакт','Консультация','КП/Накладная','Оплата','Доставка','Установка'];
  const idx=flow.indexOf(stage); await updateDoc(doc(db,'deals',id),{stage: flow[Math.min(idx+1, flow.length-1)]});
}
function openWhatsApp(d){
  const text=encodeURIComponent(`Здравствуйте, ${d.customer?.name||''}! Доставка по адресу ${d.customer?.address||''} запланирована на ${d.delivery?.date||''} ${d.delivery?.time||''}. Спасибо, что выбрали OpenDoor!`);
  const phone=(d.customer?.phone||'').replace(/[^0-9]/g,'');
  const url= phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`; window.open(url,'_blank');
}
function openQuote(d){
  const w=window.open('','_blank');
  const rows=(d.items||[]).map(i=>`<tr><td>${i.title}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.qty*i.price)}</td></tr>`).join('');
  const t=d.totals||{revenue:0};
  w.document.write(`<!doctype html><html><head><meta charset='utf-8'><title>КП — ${d.customer?.name||''}</title><style>
    body{font-family:Inter,system-ui;padding:20px} table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left} th{color:#6b7280;font-size:12px}</style></head>
    <body><h2>Коммерческое предложение — OpenDoor</h2><div>${d.customer?.name||''} • ${d.customer?.phone||''}</div>
    <table><thead><tr><th>Позиция</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${rows}</tbody></table><h3>Итого: ${money(t.revenue)}</h3>
    <p>Адрес: ${d.customer?.address||''}</p><p>Дата/время: ${d.delivery?.date||''} ${d.delivery?.time||''}</p><script>window.print()</script></body></html>`);
  w.document.close();
}

// Swipe
function attachSwipe(el,{left,right,long}){
  let sx=0,sy=0,press=false,timer=null;
  el.addEventListener('touchstart',e=>{ const t=e.touches[0]; sx=t.clientX; sy=t.clientY; press=true; timer=setTimeout(()=>{ if(press&&long) long(); press=false; },600); },{passive:true});
  el.addEventListener('touchmove',e=>{ const t=e.touches[0]; const dx=t.clientX-sx; const dy=t.clientY-sy; if(Math.abs(dy)>30) return; el.style.transform=`translateX(${dx}px)`; el.style.opacity= (1-Math.min(Math.abs(dx)/220,.3)); },{passive:true});
  el.addEventListener('touchend',e=>{ clearTimeout(timer); const dx=e.changedTouches[0].clientX-sx; press=false; el.style.transition='.2s'; el.style.transform='translateX(0)'; el.style.opacity=1; setTimeout(()=>el.style.transition='',200); if(Math.abs(dx)>80){ if(dx<0&&left) left(); if(dx>0&&right) right(); } });
}

// Excel export
function exportExcel(){
  const unsub=onSnapshot(collection(db,'deals'), (snap)=>{ const list=[]; snap.forEach(d=> list.push({id:d.id,...d.data()})); buildExcel(list); unsub(); });
}
function buildExcel(deals){
  const row = a => '<Row>'+a.map(v=> `<Cell><Data ss:Type="String">${(v??'').toString().replace(/&/g,'&amp;')}</Data></Cell>`).join('')+'</Row>';
  const dealsSheet = (()=>{ const head=row(['ID','Клиент','Телефон','Источник','Этап','Сумма','Себестоимость','Маржа','%','Менеджер','Адрес','Дата']); const rows=deals.map(d=> row([d.id,d.customer?.name,d.customer?.phone,d.customer?.source,d.stage,d.totals?.revenue||0,d.totals?.cost||0,d.totals?.margin||0,d.totals?.mperc||0,d.managerUid||'',d.customer?.address||'', `${d.delivery?.date||''} ${d.delivery?.time||''}` ])).join(''); return `<Worksheet ss:Name="Сделки"><Table>${head}${rows}</Table></Worksheet>`; })();
  const clientsSheet = (()=>{ const m={}; deals.forEach(d=>{ const k=d.customer?.phone||d.customer?.name; if(!m[k]) m[k]={name:d.customer?.name,phone:d.customer?.phone,source:d.customer?.source,sum:0,cnt:0}; m[k].sum+=Number(d.totals?.revenue||0); m[k].cnt+=1; }); const head=row(['ФИО','Телефон','Источник','Кол-во','Сумма']); const rows=Object.values(m).map(c=>row([c.name,c.phone,c.source,c.cnt,c.sum])).join(''); return `<Worksheet ss:Name="Клиенты"><Table>${head}${rows}</Table></Worksheet>`; })();
  const topSheet = (()=>{ const m={}; deals.forEach(d=> (d.items||[]).forEach(i=>{ const k=i.title||'Товар'; if(!m[k]) m[k]={qty:0,sum:0,margin:0}; m[k].qty+=Number(i.qty||0); m[k].sum+=Number(i.qty*i.price||0); m[k].margin+=Number((i.price-i.cost)*i.qty||0); })); const head=row(['Товар','Кол-во','Сумма','Маржа']); const rows=Object.entries(m).map(([k,v])=>row([k,v.qty,v.sum,v.margin])).join(''); return `<Worksheet ss:Name="Топ товары"><Table>${head}${rows}</Table></Worksheet>`; })();
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${dealsSheet}${clientsSheet}${topSheet}</Workbook>`;
  const blob = new Blob([xml], {type:'application/vnd.ms-excel'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='OpenDoor_Export.xlsx'; a.click();
}

// initial
render('pipeline'); if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js'); }
