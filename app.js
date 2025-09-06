// OpenDoor CRM — функционал
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence, collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(()=>{});
const db = getFirestore(app);
enableIndexedDbPersistence(db).catch(()=>{});

const STAGES = ['lead','consult','kp','pay','delivery','install'];
const TITLES = {lead:'Лид',consult:'Консультация',kp:'КП/Накладная',pay:'Оплата',delivery:'Доставка',install:'Установка'};
const money = n => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'KZT',maximumFractionDigits:0}).format(Number(n||0));
const qs = s => document.querySelector(s), qsa = s => [...document.querySelectorAll(s)];
const toast = (t)=>{ const el=qs('#toast'); el.textContent=t; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2000); };
const digits = s => String(s||'').replace(/\D/g,'');
const waLink = p => digits(p)?`https://wa.me/${digits(p)}`:'#';

// PWA SW
if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt=e; });
qs('#installBtn').addEventListener('click', async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; });

// Tabs
qsa('.tab').forEach(b=>b.addEventListener('click',()=>{
  qsa('.tab').forEach(x=>x.classList.remove('is-active')); b.classList.add('is-active');
  qsa('.pane').forEach(p=>p.classList.remove('is-active')); qs('#tab-'+b.dataset.tab).classList.add('is-active');
}));

// Auth
const provider = new GoogleAuthProvider();
function renderUser(u){
  const box = qs('#userBox');
  if(!u){ box.innerHTML = `<button id="loginBtn" class="btn primary">Войти через Google</button>`; qs('#loginBtn').onclick=()=>signInWithPopup(auth,provider); }
  else { box.innerHTML = `<img class="avatar" src="${u.photoURL||'logo.png'}"><span>${u.displayName||u.email}</span><button id="logoutBtn" class="btn">Выйти</button>`; qs('#logoutBtn').onclick=()=>signOut(auth); }
}
let userRole='manager';
onAuthStateChanged(auth, async (u)=>{
  renderUser(u);
  if(!u){ resetUI(); return; }
  // ensure user doc and role
  const uref = doc(db,'users',u.uid);
  const snap = await getDoc(uref);
  if(!snap.exists()){ await setDoc(uref,{name:u.displayName||'',email:u.email||'',role:'owner',createdAt:serverTimestamp()}); userRole='owner'; }
  else userRole = snap.data().role||'manager';
  subscribeAll();
});

function resetUI(){
  qs('#funnel').innerHTML='';
  qs('#dealsList').innerHTML='';
  qs('#clientsList').innerHTML='';
  updateKPI([],true);
}

// Data listeners
let unsubDeals=null, unsubClients=null;
let allDeals=[], allClients=[];

qs('#showArchive').addEventListener('change', ()=> renderAll());
qs('#dealSearch').addEventListener('input', ()=> renderAll());
qs('#dealSearchList').addEventListener('input', ()=> renderAll());
qs('#clientSearch').addEventListener('input', ()=> renderAll());

function subscribeAll(){
  unsubDeals?.(); unsubClients?.();
  unsubDeals = onSnapshot(collection(db,'deals'), snap=>{
    allDeals = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderAll();
  });
  unsubClients = onSnapshot(collection(db,'clients'), snap=>{
    allClients = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderAll();
  });
}

function renderAll(){
  const showArchive = qs('#showArchive').checked;
  const term = (qs('#dealSearch').value||'').toLowerCase();
  const deals = allDeals.filter(d=> (showArchive||!d.archived) && (`${d.name||''} ${d.phone||''}`.toLowerCase().includes(term)) );
  renderFunnel(deals);
  renderDealsList(deals);
  renderClients(allClients);
  updateKPI(deals);
}

// KPI
function updateKPI(deals=[],clear){
  if(clear){ ['lead','delivery','install'].forEach(k=>qs('#kpi-'+k).textContent = (k==='lead'?'Лид: 0':k==='delivery'?'Доставка: 0':'Установка: 0')); return; }
  const lead=deals.filter(d=>d.stage==='lead' && !d.archived).length;
  const del = deals.filter(d=>d.stage==='delivery' && !d.archived).length;
  const ins = deals.filter(d=>d.stage==='install' && !d.archived).length;
  qs('#kpi-lead').textContent = `Лид: ${lead}`;
  qs('#kpi-delivery').textContent = `Доставка: ${del}`;
  qs('#kpi-install').textContent = `Установка: ${ins}`;
}

// Funnel
function renderFunnel(deals){
  const html = STAGES.map(s=>`
    <div class="column" data-stage="${s}">
      <div class="column__head">
        <div class="column__title">${TITLES[s]}</div>
        <div class="column__count">${deals.filter(d=>d.stage===s).length}</div>
      </div>
      <div class="column__body" ondragover="event.preventDefault()"></div>
    </div>`).join('');
  qs('#funnel').innerHTML = html;
  // collapse persist
  qsa('.column').forEach(col=>{
    const key='col_'+col.dataset.stage;
    if(localStorage.getItem(key)==='1') col.classList.add('is-collapsed');
    col.querySelector('.column__head').addEventListener('click',()=>{
      col.classList.toggle('is-collapsed');
      localStorage.setItem(key, col.classList.contains('is-collapsed')?'1':'0');
    });
  });
  // fill cards
  STAGES.forEach(s=>{
    const body = qs(`.column[data-stage="${s}"] .column__body`);
    body.innerHTML = deals.filter(d=>d.stage===s).map(dealCard).join('') || '';
  });
  attachDealHandlers();
  // drop on body or head
  qsa('.column').forEach(col=>{
    const body = col.querySelector('.column__body');
    [body,col.querySelector('.column__head')].forEach(t=>{
      t.addEventListener('drop', async e=>{
        const id = e.dataTransfer.getData('text/plain');
        await updateDoc(doc(db,'deals',id), {stage: col.dataset.stage});
      });
      t.addEventListener('dragover', e=> e.preventDefault());
    });
  });
}

function dealCard(d){
  const badge = `<span class="badge">${TITLES[d.stage]||'Новая'}</span>${d.archived?'<span class="badge">Архив</span>':''}`;
  return `
  <div class="deal-card" draggable="true" data-id="${d.id}">
    <div class="status-badges">${badge}</div>
    <div class="content">
      <div class="name"><strong>${escapeHtml(d.name||'Без имени')}</strong></div>
      ${d.phone?`<div class="phone"><a target="_blank" href="${waLink(d.phone)}">+${digits(d.phone)}</a></div>`:''}
      ${d.total?`<div class="sum">Сумма: ${money(d.total)}</div>`:''}
      ${d.margin?`<div class="sum">Маржа: ${money(d.margin)}</div>`:''}
      ${d.source?`<div class="muted">Источник: ${escapeHtml(d.source)}</div>`:''}
    </div>
    <div class="actions">
      <button class="btn small" data-act="docs">Документы</button>
      <button class="btn small" data-act="archive">${d.archived?'Разархивировать':'Архивировать'}</button>
      ${userRole==='owner'?'<button class="btn danger small" data-act="delete">Удалить</button>':''}
    </div>
  </div>`;
}

function attachDealHandlers(){
  qsa('.deal-card').forEach(card=>{
    const id=card.dataset.id;
    card.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed='move'; });
    card.querySelectorAll('[data-act]').forEach(btn=>btn.addEventListener('click', async ()=>{
      const act=btn.dataset.act;
      if(act==='archive'){ const ref=doc(db,'deals',id); const d=allDeals.find(x=>x.id===id); await updateDoc(ref,{archived:!d.archived}); }
      if(act==='delete'){ if(userRole!=='owner') return toast('Удалять может только владелец'); if(confirm('Удалить сделку?')) await deleteDoc(doc(db,'deals',id)); }
      if(act==='docs'){ window.open('kp.html','_blank'); }
    }));
  });
}

// Deals list
function renderDealsList(deals){
  const term = (qs('#dealSearchList').value||'').toLowerCase();
  const list = deals.filter(d=>!term || (`${d.name||''} ${d.phone||''}`).toLowerCase().includes(term));
  qs('#dealsList').innerHTML = list.map(dealCard).join('') || '<div class="muted">Пока нет сделок.</div>';
  attachDealHandlers();
}

// Clients
function renderClients(arr){
  const term = (qs('#clientSearch').value||'').toLowerCase();
  const list = arr.filter(c=>!term || (`${c.name||''} ${c.phone||''} ${c.address||''}`).toLowerCase().includes(term));
  qs('#clientsList').innerHTML = list.map(c=>`
    <div class="client-card" data-id="${c.id}">
      <div class="status-badges">${c.isVip?'<span class="badge">VIP</span>':''}</div>
      <div class="content">
        <div><strong>${escapeHtml(c.name||'Без имени')}</strong></div>
        ${c.phone?`<div><a target="_blank" href="${waLink(c.phone)}">+${digits(c.phone)}</a></div>`:''}
        ${c.address?`<div class="muted">${escapeHtml(c.address)}</div>`:''}
      </div>
      <div class="actions">
        <button class="btn small" data-act="open">Открыть</button>
        <button class="btn small" data-act="repurchase">Повторная покупка</button>
        ${userRole==='owner'?'<button class="btn danger small" data-act="delete">Удалить</button>':''}
      </div>
    </div>
  `).join('') || '<div class="muted">Пока нет клиентов.</div>';
  qsa('.client-card [data-act]').forEach(btn=>btn.addEventListener('click', async ()=>{
    const card = btn.closest('.client-card'), id=card.dataset.id, act=btn.dataset.act;
    if(act==='open'){ openClientDialog(id); }
    if(act==='repurchase'){ const snap=await getDoc(doc(db,'clients',id)); const c=snap.data()||{}; await addDoc(collection(db,'deals'),{ name:c.name||'', phone:c.phone||'', source:c.source||'', stage:'lead', total:0, margin:0, archived:false, createdAt:serverTimestamp() }); toast('Создана сделка'); }
    if(act==='delete'){ if(userRole!=='owner') return toast('Удалять клиентов может только владелец'); if(confirm('Удалить клиента?')) await deleteDoc(doc(db,'clients',id)); }
  }));
}
qs('#newClientBtn').addEventListener('click',()=>openClientDialog());

// Client dialog
function openClientDialog(id=null){
  const dlg = qs('#clientDialog');
  const f = qs('#clientForm');
  const delBtn = qs('#clientDeleteBtn');
  const repBtn = qs('#clientRepeatBtn');
  const title = qs('#clientDialogTitle');
  let data = {name:'',phone:'',source:'',address:'',notes:''};
  if(id){ title.textContent='Клиент'; repBtn.style.display='inline-flex'; delBtn.style.display = (userRole==='owner'?'inline-flex':'none'); }
  else { title.textContent='Новый клиент'; repBtn.style.display='none'; delBtn.style.display='none'; }
  (async ()=>{
    if(id){ const snap=await getDoc(doc(db,'clients',id)); if(snap.exists()) data={id:snap.id,...snap.data()}; }
    f.name.value=data.name||''; f.phone.value=data.phone||''; f.source.value=data.source||''; f.address.value=data.address||''; f.notes.value=data.notes||'';
  })();
  repBtn.onclick = async ()=>{ const c={name:f.name.value, phone:f.phone.value, source:f.source.value}; await addDoc(collection(db,'deals'), { name:c.name||'', phone: c.phone||'', source:c.source||'', stage:'lead', total:0, margin:0, archived:false, createdAt: serverTimestamp() }); dlg.close(); toast('Создана сделка'); };
  delBtn.onclick = async ()=>{ if(userRole!=='owner') return; if(!id) return; if(confirm('Удалить клиента?')){ await deleteDoc(doc(db,'clients',id)); dlg.close(); } };
  qs('#clientSaveBtn').onclick = async ()=>{
    const payload = { name:f.name.value.trim(), phone:f.phone.value.trim(), source:f.source.value.trim(), address:f.address.value.trim(), notes:f.notes.value.trim(), updatedAt:serverTimestamp() };
    if(id) await updateDoc(doc(db,'clients',id), payload); else await addDoc(collection(db,'clients'), { ...payload, createdAt: serverTimestamp() });
    dlg.close(); toast('Сохранено');
  };
  dlg.showModal();
}

// FAB for new deal
qs('#fab').addEventListener('click',()=>{
  const dlg=qs('#dealDialog'); const f=qs('#dealForm'); qs('#dealDialogTitle').textContent='Новая сделка';
  f.reset(); f.stage.value='lead';
  qs('#dealSaveBtn').onclick = async ()=>{
    const payload = {
      name: f.name.value.trim(), phone: f.phone.value.trim(), source: f.source.value.trim(),
      total: Number(f.total.value||0), margin: Number(f.margin.value||0),
      stage: f.stage.value, notes: f.notes.value.trim(),
      archived:false, createdAt: serverTimestamp(), createdBy: auth.currentUser?.uid||null
    };
    await addDoc(collection(db,'deals'), payload);
    dlg.close(); toast('Добавлено');
  };
  dlg.showModal();
});

// Reports
qsa('#tab-reports .chip').forEach(c=>c.addEventListener('click',()=>{ qsa('#tab-reports .chip').forEach(x=>x.classList.remove('is-active')); c.classList.add('is-active'); buildReports(c.dataset.range); }));
function rangeStart(r){ const d=new Date(); if(r==='week') d.setDate(d.getDate()-7); else if(r==='month') d.setMonth(d.getMonth()-1); else if(r==='3m') d.setMonth(d.getMonth()-3); else if(r==='6m') d.setMonth(d.getMonth()-6); else d.setHours(0,0,0,0); return d; }
async function buildReports(range='day'){
  const from = rangeStart(range).getTime()/1000;
  const win = allDeals.filter(d=> (d.createdAt?.seconds||0) >= from && !d.archived);
  const revenue = win.reduce((s,d)=>s+Number(d.total||0),0);
  const margin  = win.reduce((s,d)=>s+Number(d.margin||0),0);
  const byStage = STAGES.map(s=>({name:TITLES[s], count: win.filter(d=>d.stage===s).length}));
  // top clients by amount
  const sums = {}; win.forEach(d=>{ const k=(d.name||'—').trim(); sums[k]=(sums[k]||0)+Number(d.total||0); });
  const top = Object.entries(sums).sort((a,b)=>b[1]-a[1]).slice(0,5);
  qs('#reports').innerHTML = `
    <div class="cards">
      <div class="client-card"><div class="content"><div class="name"><strong>Выручка</strong></div><div class="sum">${money(revenue)}</div></div></div>
      <div class="client-card"><div class="content"><div class="name"><strong>Маржа</strong></div><div class="sum">${money(margin)}</div></div></div>
      <div class="client-card"><div class="content"><div class="name"><strong>Сделок</strong></div><div class="sum">${win.length}</div></div></div>
      <div class="client-card"><div class="content"><div class="name"><strong>По этапам</strong></div>${byStage.map(x=>`<div class="muted">${x.name}: <b>${x.count}</b></div>`).join('')}</div></div>
      <div class="client-card"><div class="content"><div class="name"><strong>Топ клиенты</strong></div>${top.map(([n,amt])=>`<div class="muted">${escapeHtml(n)} — <b>${money(amt)}</b></div>`).join('')||'<div class="muted">Пусто</div>'}</div></div>
    </div>
  `;
}
buildReports('day');

// Archive completed (stage=install)
qs('#archiveDoneBtn').addEventListener('click', async ()=>{
  const batch = writeBatch(db);
  const targets = allDeals.filter(d=>d.stage==='install' && !d.archived);
  targets.forEach(d=> batch.update(doc(db,'deals',d.id), {archived:true, updatedAt:serverTimestamp()}));
  await batch.commit();
  toast(`Архивировано: ${targets.length}`);
});

// Utils
function escapeHtml(s=''){ return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
