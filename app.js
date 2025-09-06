// Firebase SDK (v9 modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// ===== Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const provider = new GoogleAuthProvider();

// ===== UI helpers
const $  = (s, e=document)=>e.querySelector(s);
const $$ = (s, e=document)=>[...e.querySelectorAll(s)];
const money = n => (n? new Intl.NumberFormat('ru-RU').format(+n):'0');

// Theme
$('#themeBtn').onclick = () => document.body.classList.toggle('light');

// Tabs
$$('.tab').forEach(btn=>{
  btn.onclick=()=>{
    $$('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const id = btn.dataset.tab;
    $$('.tab-panel').forEach(p=>p.classList.remove('active'));
    $('#tab-'+id).classList.add('active');
  };
});

// Pipeline stages (как ты задавал)
const STAGES = [
  'Лид','Контакт','Консультация','КП/Накладная','Оплата','Доставка','Установка'
];
const stagesSelect = $('#d_stage');
stagesSelect.innerHTML = STAGES.map(s=>`<option>${s}</option>`).join('');
$('#stagesChips').innerHTML = STAGES.map(s=>`<span class="chip">${s}</span>`).join('');

// ===== Auth
const loginBtn = $('#loginBtn');
const logoutBtn = $('#logoutBtn');
const userBadge = $('#userBadge');
let currentUser = null;

loginBtn.onclick = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    alert('Ошибка входа: '+ e.message);
  }
};
logoutBtn.onclick = ()=>signOut(auth);

onAuthStateChanged(auth, async (user)=>{
  currentUser = user;
  if(user){
    loginBtn.classList.add('hidden');
    userBadge.classList.remove('hidden');
    userBadge.textContent = user.displayName || user.email;

    $('#roleText').textContent = 'manager / owner (минимальные правила)';
    subscribeCollections();
  }else{
    userBadge.classList.add('hidden');
    loginBtn.classList.remove('hidden');
    clearLists();
  }
});

// ===== Firestore: live data
let unsubDeals = null, unsubClients = null;

function subscribeCollections(){
  if(unsubDeals)  unsubDeals();
  if(unsubClients)unsubClients();

  const qDeals = query(collection(db,'deals'), orderBy('createdAt','desc'));
  unsubDeals = onSnapshot(qDeals, snap=>{
    const deals = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderDeals(deals);
    renderFunnel(deals);
    renderReports(deals);
  });

  const qClients = query(collection(db,'clients'), orderBy('name'));
  unsubClients = onSnapshot(qClients, snap=>{
    const clients = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderClients(clients);
  });
}

function clearLists(){
  $('#dealList').innerHTML='';
  $('#clientList').innerHTML='';
  $('#funnelList').innerHTML='';
}

// ===== Render: Deals
function renderDeals(items){
  const term = ($('#dealSearch').value||'').toLowerCase();
  const filtered = items.filter(x=>{
    return [x.client,x.phone,x.note].filter(Boolean).some(v=>String(v).toLowerCase().includes(term));
  });

  $('#dealList').innerHTML = filtered.map(d=>`
    <div class="card deal">
      <div class="row">
        <div><b>${d.client||'—'}</b> · <span class="chip">${d.stage}</span></div>
        <div><b>${money(d.amount)} ₸</b> · маржа ${money(d.margin)} ₸</div>
      </div>
      <div class="meta">${d.phone||''} · ${d.source||''} · ${d.note||''}</div>
    </div>
  `).join('') || `<div class="hint">Сделок нет</div>`;
}
$('#dealSearch').oninput = ()=>subscribeCollections(); // перерендер

// ===== Render: Clients
function renderClients(items){
  const term = ($('#clientSearch').value||'').toLowerCase();
  const filtered = items.filter(x=>{
    return [x.name,x.phone].filter(Boolean).some(v=>String(v).toLowerCase().includes(term));
  });

  $('#clientList').innerHTML = filtered.map(c=>`
    <div class="card">
      <div class="row">
        <div><b>${c.name||'Без имени'}</b></div>
        <div>${c.phone||''}</div>
      </div>
      <div class="meta">${c.source||''}</div>
    </div>
  `).join('') || `<div class="hint">Клиентов пока нет</div>`;
}
$('#clientSearch').oninput = ()=>subscribeCollections();

// ===== Render: Funnel
function renderFunnel(deals){
  const byStage = Object.fromEntries(STAGES.map(s=>[s,[]]));
  deals.forEach(d=>{ if(byStage[d.stage]) byStage[d.stage].push(d); });

  $('#funnelList').innerHTML = STAGES.map(s=>{
    const arr = byStage[s];
    const sum = arr.reduce((a,b)=>a+(+b.amount||0),0);
    const mrg = arr.reduce((a,b)=>a+(+b.margin||0),0);
    return `
      <div class="stage">
        <h4>${s}</h4>
        <div class="kpi">
          <span class="chip">Сделок: ${arr.length}</span>
          <span class="chip">Сумма: ${money(sum)} ₸</span>
          <span class="chip">Маржа: ${money(mrg)} ₸</span>
        </div>
        ${arr.slice(0,5).map(d=>`
          <div class="deal">
            <div class="row"><div><b>${d.client||'—'}</b></div><div>${money(d.amount)} ₸</div></div>
            <div class="meta">${d.phone||''} · ${d.source||''}</div>
          </div>
        `).join('')}
        ${arr.length>5?`<div class="meta">+ ещё ${arr.length-5}</div>`:''}
      </div>
    `;
  }).join('');
}

// ===== Render: Reports (очень базово)
function renderReports(deals){
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthDeals = deals.filter(d=>{
    if(!d.createdAt?.toDate) return true; // если оффлайн данные без TS — не режем
    const dt = d.createdAt.toDate();
    return dt.getFullYear()===now.getFullYear() && dt.getMonth()===now.getMonth();
  });
  const sum = monthDeals.reduce((a,b)=>a+(+b.amount||0),0);
  const mrg = monthDeals.reduce((a,b)=>a+(+b.margin||0),0);
  $('#revMonth').textContent = `${money(sum)} ₸`;
  $('#marginMonth').textContent = `${money(mrg)} ₸`;

  const leads = deals.filter(d=>d.stage==='Лид').length || 0;
  const success = deals.filter(d=>d.stage==='Установка').length || 0;
  $('#convRate').textContent = leads? `${Math.round(success/leads*100)}%` : '—';
}

// ===== Create Deal (FAB + модалка)
$('#fab').onclick = ()=>{
  if(!currentUser){ alert('Сначала войдите через Google'); return; }
  $('#dealDialogTitle').textContent = 'Новая сделка';
  $('#dealForm').reset();
  $('#dealDialog').showModal();
};

$('#dealForm').onsubmit = async (e)=>{
  e.preventDefault();
  const payload = {
    client: $('#d_client').value.trim(),
    phone:  $('#d_phone').value.trim(),
    source: $('#d_source').value,
    amount: +$('#d_amount').value||0,
    margin: +$('#d_margin').value||0,
    stage:  $('#d_stage').value,
    note:   $('#d_note').value.trim(),
    createdAt: serverTimestamp(),
    ownerUid: currentUser?.uid || null
  };
  try{
    await addDoc(collection(db,'deals'), payload);
    // авто-создание клиента (если нет)
    if(payload.client){
      const qs = await getDocs(query(collection(db,'clients'), where('name','==',payload.client)));
      if(qs.empty){
        await addDoc(collection(db,'clients'), { name: payload.client, phone: payload.phone, source: payload.source, createdAt: serverTimestamp() });
      }
    }
    $('#dealDialog').close();
  }catch(err){
    // оффлайн — складываем в очередь и синканём при онлайне
    enqueueOffline({type:'addDeal', payload});
    $('#dealDialog').close();
    alert('Нет сети — сделка сохранена в очередь. Отправим при подключении.');
  }
};

// ===== Offline queue (простой)
const QUEUE_KEY='od_offline_queue';
function enqueueOffline(job){
  const arr = JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');
  arr.push(job);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(arr));
  updateQueueInfo();
}
async function flushQueue(){
  const arr = JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');
  if(!arr.length) return;
  for(const job of arr){
    if(job.type==='addDeal'){
      try{ await addDoc(collection(db,'deals'), {...job.payload, createdAt: serverTimestamp()}); }
      catch(e){ console.log('retry later', e); return; }
    }
  }
  localStorage.removeItem(QUEUE_KEY);
  updateQueueInfo();
}
function updateQueueInfo(){
  const n = (JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]')).length;
  $('#queueInfo').textContent = n? `В очереди: ${n}` : 'Очередь пуста';
}
window.addEventListener('online', flushQueue);
updateQueueInfo();

// ===== Service worker
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js');
}
