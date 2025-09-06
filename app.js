// ==== Firebase (Auth + Firestore) ====
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore /*, collection, addDoc, getDocs, query, where */ } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);
const provider = new GoogleAuthProvider();

// UI: логин/логаут
const loginBtn  = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userName  = document.getElementById('userName');

if (loginBtn)  loginBtn.onclick  = () => signInWithPopup(auth, provider).catch(e => toast('Ошибка входа'));
if (logoutBtn) logoutBtn.onclick = () => signOut(auth).catch(()=>{});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginBtn && (loginBtn.style.display = 'none');
    logoutBtn && (logoutBtn.style.display = 'inline-block');
    userName && (userName.textContent = user.displayName || user.email);
    // тут позже можно подгружать реальные сделки/клиентов из Firestore
  } else {
    loginBtn && (loginBtn.style.display = 'inline-block');
    logoutBtn && (logoutBtn.style.display = 'none');
    userName && (userName.textContent = '');
  }
});

const $ = (s,e=document)=>e.querySelector(s);
const $$ = (s,e=document)=>Array.from(e.querySelectorAll(s));
const money = n => new Intl.NumberFormat('ru-RU').format((+n)||0)+' ₸';
const toast = (t)=>{ const el=$('#toast'); el.textContent=t; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),1500); };

// THEME
const themeKey = 'opendoor_theme';
function applyTheme(t){ document.documentElement.classList.toggle('light', t==='light'); $('#themeToggle').textContent = t==='light' ? '🌞' : '🌙'; localStorage.setItem(themeKey,t);}
const savedTheme = localStorage.getItem(themeKey) || 'dark'; applyTheme(savedTheme);
$('#themeToggle').onclick = ()=> applyTheme( document.documentElement.classList.contains('light') ? 'dark' : 'light');

// DATA
const storeKey = 'opendoor_deals_v3';
let deals = JSON.parse(localStorage.getItem(storeKey) || '[]');
if(deals.length===0){
  deals = [
    { id:'DL-001', name:'Айжан Н.', phone:'+7 777 000 11 22', address:'Тараз, Абая 10', source:'Instagram', stage:'КП/Накладная', items:[
      {title:'Дверь ARNAU Classic 80', qty:2, price:75000, cost:52000},
      {title:'Ламинат Oak 33 класс', qty:20, price:6500, cost:4500},
    ], date:'2025-08-12', time:'14:00', manager:'Менеджер' },
  ];
  save();
}
function save(){ localStorage.setItem(storeKey, JSON.stringify(deals)); }

// ROUTER
const SCREENS = {};
function render(screen='pipeline', data=null){ const root = $('#app'); root.innerHTML=''; root.appendChild(SCREENS[screen](data)); }
function navTo(tab){ $$('.tabs button').forEach(b=>b.classList.toggle('active', b.dataset.screen===tab)); render(tab); }
$$('.tabs button').forEach(btn=> btn.onclick=()=> navTo(btn.dataset.screen));

// SHEET (NEW DEAL)
const sheet = $('#sheet');
function openSheet(){ clearForm(); sheet.classList.add('show'); sheet.classList.remove('hidden'); sheet.setAttribute('aria-hidden','false'); $('#dName').focus(); }
function closeSheet(){ sheet.classList.remove('show'); sheet.setAttribute('aria-hidden','true'); setTimeout(()=> sheet.classList.add('hidden'), 180); }
$('#fab').onclick = openSheet; $('#addDealTop').onclick = openSheet; $('#sheetClose').onclick = closeSheet;

$('#addItem').onclick = ()=> addItemRow();
$('#saveDeal').onclick = ()=> {
  const d = collectDealFromForm();
  if(!d.name){ toast('Введите имя клиента'); return; }
  if(!d.phone){ toast('Введите телефон'); return; }
  deals.unshift(d); save(); closeSheet(); navTo('pipeline'); toast('Сделка сохранена');
};

function phoneMask(v){
  const digits = v.replace(/\D/g,'');
  if(digits.startsWith('8')) return '+7 ' + digits.slice(1).replace(/(\d{3})(\d{3})(\d{2})(\d{2}).*/, '$1 $2 $3 $4');
  if(digits.startsWith('7')) return '+7 ' + digits.slice(1).replace(/(\d{3})(\d{3})(\d{2})(\d{2}).*/, '$1 $2 $3 $4');
  return '+7 ' + digits.replace(/(\d{3})(\d{3})(\d{2})(\d{2}).*/, '$1 $2 $3 $4');
}

function clearForm(){
  $('#dName').value=''; $('#dPhone').value=''; $('#dAddress').value=''; $('#dSource').value='Instagram';
  $('#dDate').value=''; $('#dTime').value='';
  $('#dPhone').oninput = (e)=> e.target.value = phoneMask(e.target.value);
  $('#items').innerHTML=''; $('#totals').innerHTML='';
  addItemRow();
}
function collectDealFromForm(){
  const id = 'DL-' + Math.random().toString(36).slice(2,7).toUpperCase();
  const items = $$('.item').map(row=> ({
    title: row.querySelector('.t').value || 'Товар',
    qty: Math.max(1, parseFloat(row.querySelector('.q').value)||1),
    price: Math.max(0, parseFloat(row.querySelector('.p').value)||0),
    cost: Math.max(0, parseFloat(row.querySelector('.c').value)||0),
  }));
  const totals = calcTotals(items);
  return {
    id,
    name: $('#dName').value.trim(),
    phone: $('#dPhone').value.trim(),
    address: $('#dAddress').value.trim(),
    source: $('#dSource').value,
    date: $('#dDate').value, time: $('#dTime').value,
    stage: 'Лид',
    items,
    manager: 'Менеджер',
    totals
  };
}
function addItemRow(){
  const row = document.createElement('div'); row.className='item';
  row.innerHTML = `
    <input class="input t" placeholder="Название">
    <input class="input q" type="number" placeholder="Кол-во" value="1" min="1">
    <input class="input p" type="number" placeholder="Цена" min="0" step="1">
    <input class="input c" type="number" placeholder="Себестоимость" min="0" step="1">
    <button class="del" aria-label="Удалить позицию">✕</button>`;
  row.querySelectorAll('.q,.p,.c').forEach(inp=> inp.oninput = updateTotalsUI);
  row.querySelector('.t').oninput = updateTotalsUI;
  row.querySelector('.del').onclick = ()=> { row.remove(); updateTotalsUI(); };
  $('#items').appendChild(row);
  updateTotalsUI();
}
function calcTotals(items){
  const revenue = items.reduce((s,i)=> s + i.qty * i.price, 0);
  const cost = items.reduce((s,i)=> s + i.qty * i.cost, 0);
  const margin = revenue - cost;
  const mperc = revenue>0 ? Math.round((margin/revenue)*1000)/10 : 0;
  return { revenue, cost, margin, mperc };
}
function updateTotalsUI(){
  const items = $$('.item').map(row=> ({
    title: row.querySelector('.t').value || 'Товар',
    qty: Math.max(1, parseFloat(row.querySelector('.q').value)||1),
    price: Math.max(0, parseFloat(row.querySelector('.p').value)||0),
    cost: Math.max(0, parseFloat(row.querySelector('.c').value)||0),
  }));
  const t = calcTotals(items);
  $('#totals').innerHTML = `
    <span class="pill">Выручка: ${money(t.revenue)}</span>
    <span class="pill">Себестоимость: ${money(t.cost)}</span>
    <span class="pill">Маржа: ${money(t.margin)} (${t.mperc}%)</span>`;
}

// PIPELINE
SCREENS.pipeline = () => {
  const wrap = document.createElement('div');
  const hint = document.createElement('div'); hint.className='swipe-hint'; hint.textContent='Свайп: ← КП, → След. этап, долго — WhatsApp';
  wrap.appendChild(hint);
  deals.forEach(d => {
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div>
          <h3 style="margin:0 0 4px 0">${d.name}</h3>
          <div class="kb">${d.phone} • ${d.address || 'Адрес не указан'} • Источник: ${d.source}</div>
        </div>
        <div class="badge">${d.stage}</div>
      </div>
      <div class="row" style="margin-top:8px">
        <div class="stage">Выручка: ${money(totalOf(d).revenue)}</div>
        <div class="stage">Маржа: ${money(totalOf(d).margin)} (${totalOf(d).mperc}%)</div>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn" data-open>Открыть</button>
      </div>
    `;
    // Swipe handlers with vertical guard and long-press cancel on move
    attachSwipe(card, {
      left: () => openQuote(d),
      right: () => { nextStage(d); toast('Этап обновлён'); },
      long: () => openWhatsApp(d)
    });
    card.querySelector('[data-open]').onclick = () => navTo('deal') || renderDeal(d);
    wrap.appendChild(card);
  });
  return wrap;
};

function totalOf(d){
  if(!d.totals) d.totals = calcTotals(d.items||[]);
  return d.totals;
}

function openQuote(d){
  const w = window.open('', '_blank');
  const rows = (d.items||[]).map(i=>`<tr><td>${i.title}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.qty*i.price)}</td></tr>`).join('');
  const t = totalOf(d);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>КП — ${d.name}</title>
    <style>body{{font-family:-apple-system,Inter,Segoe UI,Roboto;padding:20px}} table{{width:100%;border-collapse:collapse}} th,td{{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left}} th{{color:#6b7280;font-size:12px}}</style>
  </head><body>
    <h2>Коммерческое предложение — Opendoor</h2>
    <div>${d.name} • ${d.phone}</div>
    <table><thead><tr><th>Позиция</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${rows}</tbody></table>
    <h3>Итого: ${money(t.revenue)}</h3>
    <p>Адрес: ${d.address||''}</p>
    <p>Дата/время: ${d.date||''} ${d.time||''}</p>
    <script>window.print()</script>
  </body></html>`);
  w.document.close();
}

function nextStage(d){
  const stages = ['Лид','Контакт','Консультация','КП/Накладная','Оплата','Доставка','Установка'];
  const idx = stages.indexOf(d.stage);
  d.stage = stages[Math.min(idx+1, stages.length-1)] || stages[0];
  save(); navTo('pipeline');
}

function openWhatsApp(d){
  const text = encodeURIComponent(`Здравствуйте, ${d.name}!\nНапоминаем, что доставка по адресу ${d.address||''} запланирована на ${d.date||''} ${d.time||''}.\nСпасибо, что выбрали Opendoor!`);
  const phone = (d.phone||'').replace(/[^0-9]/g,'');
  const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  window.open(url, '_blank');
}

// Swipe + long press with guards
function attachSwipe(el, {left,right,long}){
  let sx=0, sy=0, pressed=false, longTO=null, moved=false;
  el.addEventListener('touchstart', (e)=>{
    const t = e.touches[0]; sx=t.clientX; sy=t.clientY; pressed=true; moved=false;
    longTO = setTimeout(()=>{ if(pressed && !moved && long) long(); pressed=false; }, 600);
  }, {passive:true});
  el.addEventListener('touchmove', (e)=>{
    const t=e.touches[0]; const dx=t.clientX-sx; const dy=t.clientY-sy;
    if(Math.abs(dy)>30) moved=true; // prevent swipe if vertical scroll
    el.style.transform = `translateX(${dx}px)`; el.style.opacity = (1-Math.min(Math.abs(dx)/220, .3));
  }, {passive:true});
  el.addEventListener('touchend', (e)=>{
    clearTimeout(longTO);
    const dx = e.changedTouches[0].clientX - sx; pressed=false;
    el.style.transition='.18s'; el.style.transform='translateX(0)'; el.style.opacity=1;
    setTimeout(()=>{ el.style.transition=''; },180);
    if(Math.abs(dx)>90 && Math.abs(dx) > 2*Math.abs(e.changedTouches[0].clientY - sy)){
      if(dx<0 && left) left(); else if(dx>0 && right) right();
    }
  });
}

// DEAL screen
function renderDeal(d){
  const root = $('#app'); root.innerHTML='';
  const card = document.createElement('div'); card.className='card';
  const t = totalOf(d);
  card.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <div><h3 style="margin:0 0 4px 0">${d.name}</h3><div class="kb">${d.phone} • ${d.address||''}</div></div>
      <div class="badge">${d.stage}</div>
    </div>
    <div class="row" style="margin-top:8px">
      <div class="stage">Выручка: ${money(t.revenue)}</div>
      <div class="stage">Себестоимость: ${money(t.cost)}</div>
      <div class="stage">Маржа: ${money(t.margin)} (${t.mperc}%)</div>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn" id="btnQuote">📄 КП</button>
      <button class="btn" id="btnNext">➡️ След. этап</button>
      <button class="btn" id="btnWA">💬 WhatsApp</button>
    </div>
    <h4>Позиции</h4>
    <table class="table">
      <thead><tr><th>Название</th><th>Кол-во</th><th>Цена</th><th>Себест.</th><th>Сумма</th></tr></thead>
      <tbody>
        ${(d.items||[]).map(i=> `<tr><td>${i.title}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.cost)}</td><td>${money(i.qty*i.price)}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
  root.appendChild(card);
  $('#btnQuote').onclick = ()=> openQuote(d);
  $('#btnNext').onclick = ()=> { nextStage(d); toast('Этап обновлён'); renderDeal(d); };
  $('#btnWA').onclick = ()=> openWhatsApp(d);
}
SCREENS.deal = () => { const wrap = document.createElement('div'); wrap.appendChild(document.createElement('div')).className='kb'; wrap.firstChild.textContent='Откройте сделку из Воронки'; return wrap; };

// REPORTS (with Excel export)
SCREENS.reports = () => {
  const el = document.createElement('div');
  const btn = document.createElement('button'); btn.className='btn primary'; btn.textContent='Экспорт в Excel (.xlsx)';
  btn.onclick = exportExcel;
  el.appendChild(btn);
  return el;
};

function exportExcel(){
  const xmlHeader = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>`;
  const ns = `xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"`;
  const row = arr => `<Row>`+arr.map(v=> `<Cell><Data ss:Type="String">${(v??'').toString().replace(/&/g,'&amp;')}</Data></Cell>`).join('')+`</Row>`;
  const sheetDeals = (()=>{
    const head = row(['ID','Клиент','Телефон','Источник','Этап','Сумма','Себестоимость','Маржа','% Маржи','Менеджер','Адрес','Дата']);
    const rows = deals.map(d=>{
      const t = totalOf(d);
      return row([d.id,d.name,d.phone,d.source,d.stage, t.revenue, t.cost, t.margin, t.mperc, d.manager||'', d.address||'', `${d.date||''} ${d.time||''}`]);
    }).join('');
    return `<Worksheet ss:Name="Сделки"><Table>${head}${rows}</Table></Worksheet>`;
  })();
  const sheetClients = (()=>{
    const agg = {};
    deals.forEach(d=>{
      const t = totalOf(d);
      const k = d.phone||d.name;
      agg[k] = agg[k] || {name:d.name, phone:d.phone, source:d.source, sum:0, cnt:0};
      agg[k].sum += t.revenue; agg[k].cnt += 1;
    });
    const head = row(['ФИО','Телефон','Источник','Кол-во сделок','Общая сумма']);
    const rows = Object.values(agg).map(c=> row([c.name,c.phone,c.source,c.cnt,c.sum])).join('');
    return `<Worksheet ss:Name="Клиенты"><Table>${head}${rows}</Table></Worksheet>`;
  })();
  const sheetTop = (()=>{
    const map = {};
    deals.forEach(d=> (d.items||[]).forEach(i=>{
      const key = i.title||'Товар';
      const sum = i.qty*i.price; const mar = (i.price - i.cost)*i.qty;
      if(!map[key]) map[key] = {qty:0, sum:0, margin:0};
      map[key].qty += i.qty; map[key].sum += sum; map[key].margin += mar;
    }));
    const head = row(['Товар','Кол-во','Сумма продаж','Маржа']);
    const rows = Object.entries(map).map(([k,v])=> row([k, v.qty, v.sum, v.margin])).join('');
    return `<Worksheet ss:Name="Топ товары"><Table>${head}${rows}</Table></Worksheet>`;
  })();
  const xml = `${xmlHeader}<Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" ${ns}>${sheetDeals}${sheetClients}${sheetTop}</Workbook>`;
  const blob = new Blob([xml], {type:'application/vnd.ms-excel'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Opendoor_Export.xlsx'; a.click();
}

// SETTINGS
SCREENS.settings = () => {
  const el = document.createElement('div');
  el.innerHTML = `<div class="card"><h3>Настройки</h3><div class="kb">Тема, ярлык на iPhone и офлайн включены по умолчанию.</div></div>`;
  return el;
};

// CLIENTS
SCREENS.clients = () => {
  const el = document.createElement('div');
  const input = document.createElement('input'); input.className='input'; input.placeholder='Поиск клиента...';
  el.appendChild(input);
  deals.forEach(d=>{
    const c = document.createElement('div'); c.className='card';
    c.innerHTML = `<h3 style="margin:0 0 4px 0">${d.name}</h3><div class="kb">${d.phone} • ${d.source}</div>`;
    el.appendChild(c);
  });
  return el;
};

// DEFAULT PIPELINE
SCREENS.pipeline && render('pipeline');

// PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', ()=> navigator.serviceWorker.register('sw.js?v=st1'));
}
