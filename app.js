// app.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { getFirestore, collection, addDoc, getDocs, setDoc, doc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, where, orderBy } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

import { firebaseConfig } from './firebase-config.js';

// Firebase init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence);

// DOM helpers
const $ = (s, e=document) => e.querySelector(s);
const $$ = (s, e=document) => Array.from(e.querySelectorAll(s));
const money = n => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(n||0)) + ' ₸';
const digits = s => (s||'').replace(/\D/g, '');

// State
let currentUser = null;
let role = 'manager'; // default
let deals = [];
let clients = [];

// Stages
const STAGES = [
  { key:'lead', name:'Лид' },
  { key:'consult', name:'Консультация' },
  { key:'kp', name:'КП/накладная' },
  { key:'pay', name:'Оплата' },
  { key:'delivery', name:'Доставка' },
  { key:'install', name:'Установка' }
];

// UI: Tabs
$$('.tab').forEach(btn=>btn.addEventListener('click', () => {
  $$('.tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  $$('.tab-body').forEach(v=>v.classList.remove('active'));
  $('#'+btn.dataset.tab).classList.add('active');
}));

// Install PWA
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('#installBtn').classList.remove('hidden');
});
$('#installBtn').addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }
});

// Auth
const provider = new GoogleAuthProvider();
$('#loginBtn').addEventListener('click', () => signInWithPopup(auth, provider).catch(console.error));
$('#logoutBtn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    $('#loginBtn').classList.add('hidden');
    $('#userBox').classList.remove('hidden');
    $('#userName').textContent = user.displayName || user.email;
    $('#userPhoto').src = user.photoURL || 'logo.png';
    await ensureUser(user);
    subscribeData();
  } else {
    $('#loginBtn').classList.remove('hidden');
    $('#userBox').classList.add('hidden');
    deals = []; clients = [];
    renderPipeline(); renderDeals(); renderClients(); updateCounters();
  }
});

async function ensureUser(user) {
  // users/{uid}: {role}
  const uref = doc(db, 'users', user.uid);
  await setDoc(uref, { name: user.displayName || user.email, role: role }, { merge: true });
  // read role
  const snap = await getDocs(query(collection(db,'users'), where('__name__','==', user.uid)));
  role = 'manager';
  snap.forEach(s=>{ role = (s.data().role)||'manager'; });
  $('#roleInfo').textContent = 'Ваша роль: ' + role;
}

// Subscriptions
let unsubDeals = null, unsubClients = null;
function subscribeData(){
  if (unsubDeals) unsubDeals();
  if (unsubClients) unsubClients();
  const showArch = $('#showArchive').checked;

  unsubDeals = onSnapshot(
    showArch ? collection(db, 'deals') : query(collection(db,'deals'), where('archived','!=', true)),
    (snap)=>{
      deals = snap.docs.map(d=>({ id:d.id, ...d.data()})).sort((a,b)=> (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      renderPipeline(); renderDeals(); updateCounters(); calcReports(currentRange);
    }
  );
  unsubClients = onSnapshot(collection(db,'clients'), (snap)=>{
    clients = snap.docs.map(d=>({ id:d.id, ...d.data()}));
    renderClients();
  });
}
$('#showArchive').addEventListener('change', subscribeData);

// Render pipeline columns
function renderPipeline(){
  const grid = $('#pipeGrid');
  grid.innerHTML='';
  STAGES.forEach(stage=>{
    const col = document.createElement('div');
    col.className = 'column';
    col.dataset.stage = stage.key;
    col.innerHTML = `
      <div class="col-head" draggable="false">
        <button class="collapse-btn" title="Свернуть">▾</button>
        <div class="col-title">${stage.name}</div>
        <span class="count" id="count-${stage.key}">0</span>
      </div>
      <div class="col-body" id="col-${stage.key}"></div>
    `;
    grid.appendChild(col);

    // Collapse
    col.querySelector('.collapse-btn').addEventListener('click', ()=>{
      col.classList.toggle('collapsed');
    });

    // Allow drop even when collapsed (drop on head)
    col.addEventListener('dragover', e=>{ e.preventDefault(); });
    col.addEventListener('drop', async e=>{
      e.preventDefault();
      const id = e.dataTransfer.getData('text/id');
      if (!id) return;
      await updateDoc(doc(db,'deals', id), { stage: stage.key });
    });
  });

  deals.forEach(d=>{
    const el = dealCard(d);
    const parent = $('#col-'+d.stage) || $('#col-lead');
    parent?.appendChild(el);
  });

  // counts
  STAGES.forEach(s=>{
    const n = deals.filter(d=>d.stage===s.key && !d.archived).length;
    const span = $('#count-'+s.key);
    if (span) span.textContent = n;
  });
}

// Deal card element
function dealCard(d){
  const el = document.createElement('div');
  el.className = 'card';
  el.draggable = true;
  el.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/id', d.id); });

  const phoneDigits = digits(d.phone);
  const wa = phoneDigits ? `https://wa.me/${phoneDigits}` : '#';
  const delBtn = role==='owner' ? `<button class="btn small danger" data-act="delete">Удалить</button>` : '';

  el.innerHTML = `
    <div class="row">
      <h4 class="min-w-0">${d.client||'Без имени'}</h4>
      <span class="badge tag">${d.stage}</span>
      ${d.archived?'<span class="badge">архив</span>':''}
    </div>
    <p><a class="phone" href="${wa}" target="_blank">${d.phone||''}</a> · ${d.source||''}</p>
    <p>${d.amount?('Выручка: '+money(d.amount)):' '}</p>
    <div class="actions">
      <button class="btn small" data-act="docs">Документы</button>
      <button class="btn small" data-act="archive">${d.archived?'Разархивировать':'Архивировать'}</button>
      ${delBtn}
    </div>
  `;

  el.querySelector('[data-act="docs"]').addEventListener('click', ()=> openDealModal(d));
  el.querySelector('[data-act="archive"]').addEventListener('click', async ()=>{
    await updateDoc(doc(db,'deals', d.id), { archived: !d.archived });
  });
  if (role==='owner') {
    el.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
      await deleteDoc(doc(db,'deals', d.id));
    });
  }
  return el;
}

// Deals list render
function renderDeals(){
  const list = $('#dealsList');
  const q = ($('#searchDeals').value||'').toLowerCase();
  list.innerHTML='';
  deals.filter(d=>!q || (d.client||'').toLowerCase().includes(q) || (d.phone||'').includes(q))
    .forEach(d=> list.appendChild(dealCard(d)));
}
$('#searchDeals').addEventListener('input', renderDeals);

// Clients list & modal
function renderClients(){
  const list = $('#clientsList');
  const q = ($('#searchClients').value||'').toLowerCase();
  list.innerHTML='';
  clients
  .filter(c => !q || (c.name||'').toLowerCase().includes(q) || (c.phone||'').includes(q))
  .forEach(c=>{
    const item = document.createElement('div');
    item.className='card';
    const wa = digits(c.phone) ? `https://wa.me/${digits(c.phone)}` : '#';
    item.innerHTML = `
      <div class="row">
        <h4 class="min-w-0">${c.name||'Без имени'}</h4>
        <span class="badge">${c.source||''}</span>
      </div>
      <p><a href="${wa}" target="_blank">${c.phone||''}</a></p>
      <div class="actions">
        <button class="btn small" data-act="open">Открыть</button>
        ${ role==='owner' ? '<button class="btn small danger" data-act="del">Удалить</button>' : ''}
      </div>
    `;
    item.querySelector('[data-act="open"]').addEventListener('click', ()=> openClientModal(c));
    if (role==='owner') {
      item.querySelector('[data-act="del"]').addEventListener('click', async ()=>{
        await deleteDoc(doc(db,'clients', c.id));
      });
    }
    list.appendChild(item);
  });
}
$('#searchClients').addEventListener('input', renderClients);

function openClientModal(c){
  const dlg = $('#clientModal');
  const f = $('#clientForm');
  f.name.value = c.name||'';
  f.phone.value = c.phone||'';
  f.address.value = c.address||'';
  f.source.value = c.source||'Instagram';
  f.notes.value = c.notes||'';

  $('#clientDeleteBtn').style.display = (role==='owner') ? 'inline-flex' : 'none';

  $('#repeatBuyBtn').onclick = async ()=>{
    await addDoc(collection(db,'deals'), {
      client: c.name, phone: c.phone, source: c.source, stage:'lead', amount:0, archived:false, createdAt: serverTimestamp()
    });
    dlg.close();
    $('.tab[data-tab="pipeline"]').click();
  };

  $('#clientDeleteBtn').onclick = async ()=>{
    if (role!=='owner') return;
    await deleteDoc(doc(db,'clients', c.id));
    dlg.close();
  };

  f.onsubmit = async (e)=>{
    e.preventDefault();
    await setDoc(doc(db,'clients', c.id), {
      name: f.name.value, phone: f.phone.value, address: f.address.value,
      source: f.source.value, notes: f.notes.value
    }, { merge: true });
    dlg.close();
  };
  dlg.showModal();
}

// New / edit deal
$('#addDealFab').addEventListener('click', ()=> openDealModal(null));

function openDealModal(d){
  const dlg = $('#dealModal');
  const f = $('#dealForm');
  $('#dealModalTitle').textContent = d ? 'Сделка' : 'Новая сделка';
  f.client.value = d?.client || '';
  f.phone.value  = d?.phone  || '';
  f.amount.value = d?.amount || '';
  f.source.value = d?.source || 'Instagram';
  f.stage.value  = d?.stage  || 'lead';
  f.note.value   = d?.note   || '';

  f.onsubmit = async (e)=>{
    e.preventDefault();
    const payload = {
      client: f.client.value.trim(),
      phone: f.phone.value.trim(),
      amount: Number(f.amount.value||0),
      source: f.source.value,
      stage: f.stage.value,
      note: f.note.value.trim(),
      archived: false
    };
    if (d && d.id){
      await updateDoc(doc(db,'deals', d.id), payload);
    } else {
      payload.createdAt = serverTimestamp();
      const res = await addDoc(collection(db,'deals'), payload);
      // ensure client exists
      if (payload.client){
        const exists = clients.find(c => (c.name||'').toLowerCase()===payload.client.toLowerCase() && digits(c.phone)===digits(payload.phone));
        if (!exists){
          await setDoc(doc(db,'clients', res.id), { // use deal id as client id if new
            name: payload.client, phone: payload.phone, source: payload.source
          });
        }
      }
    }
    dlg.close();
  };
  dlg.showModal();
}

// Counters
function updateCounters(){
  const counts = {lead:0, consult:0, kp:0, pay:0, delivery:0, install:0};
  deals.filter(d=>!d.archived).forEach(d=> counts[d.stage] = (counts[d.stage]||0)+1 );
  Object.keys(counts).forEach(k=>{
    const el = $('#cnt-'+k);
    if (el) el.textContent = (el.textContent.split(':')[0])+': '+(counts[k]||0);
  });
}

// Reports
let currentRange = '1d';
$$('#reports .chip').forEach(b=> b.addEventListener('click',()=>{
  currentRange = b.dataset.range;
  calcReports(currentRange);
}));
function rangeToDays(r){
  return { '1d':1, '7d':7, '30d':30, '90d':90, '180d':180 }[r]||1;
}
function calcReports(r='1d'){
  const days = rangeToDays(r);
  const now = Date.now();
  const from = now - days*24*3600*1000;
  const windowed = deals.filter(d=> (d.createdAt?.toMillis? d.createdAt.toMillis(): (d.createdAt?.seconds||0)*1000) >= from );

  $('#repDeals').textContent = windowed.length;
  const revenue = windowed.reduce((s,d)=> s + Number(d.amount||0), 0);
  $('#repRevenue').textContent = money(revenue);

  const stageCounts = STAGES.map(s=> s.name+': '+ windowed.filter(d=>d.stage===s.key).length ).join(' · ');
  $('#repStages').textContent = stageCounts;

  // top clients by count
  const byClient = {};
  windowed.forEach(d=>{
    const k = (d.client||'Без имени');
    byClient[k] = (byClient[k]||0) + 1;
  });
  const top = Object.entries(byClient).sort((a,b)=>b[1]-a[1]).slice(0,5);
  $('#repTop').innerHTML = top.map(([k,v])=>`<li>${k} — ${v}</li>`).join('');
}

// Prevent zoom on dblclick
document.addEventListener('dblclick', (e)=>{ e.preventDefault(); }, { passive:false });
