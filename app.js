// app.js — удаление лидов/клиентов, отмена добавления, карточка клиента (view)
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, setPersistence, browserLocalPersistence, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, enableIndexedDbPersistence, addDoc, collection, serverTimestamp,
  query, orderBy, onSnapshot, updateDoc, doc, where, getDocs, limit, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---- Firebase init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch(()=>{});
enableIndexedDbPersistence(db).catch(()=>{});

const provider = new GoogleAuthProvider();

// ---- Utils
const $  = (s, e=document) => e.querySelector(s);
const $$ = (s, e=document) => [...e.querySelectorAll(s)];
const money = n => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'KZT',maximumFractionDigits:0}).format(n||0);

// Normalize phone for WhatsApp (KZ default)
function normalizePhoneForWA(p){
  let n = (p||'').replace(/[^\d]/g,'');
  if(!n) return '';
  if(n.startsWith('00')) n = n.slice(2);
  if(n.startsWith('8') && n.length===11) n = '7' + n.slice(1);
  if(n.length===10) n = '7' + n;
  if(n.startsWith('77') && n.length===12) n = n.slice(1);
  if(n.startsWith('7') && n.length===11) return n;
  return n.length>=11 ? n : '';
}
function waHref(phone, client){
  const norm = normalizePhoneForWA(phone);
  const text = encodeURIComponent(`Здравствуйте, ${client||''}`.trim());
  return norm ? `https://wa.me/${norm}?text=${text}` : `tel:${phone||''}`;
}

// ---- UI refs
const loginBtn  = $("#loginBtn");
const logoutBtn = $("#logoutBtn");
const userChip  = $("#userChip");
const userName  = $("#userName");
const addDealBtn= $("#addDealBtn");
const dealDialog= $("#dealDialog");
const dealForm  = $("#dealForm");
const dlgSave   = $("#dlgSave");
const dlgCancel = $("#dlgCancel");

// Cancel add deal explicitly
dlgCancel?.addEventListener('click', (e)=>{
  e.preventDefault();
  dealDialog.close();
});
dealDialog?.addEventListener('close', ()=>{
  dealForm?.reset();
});

const STAGES = [
  {id:"lead",        name:"Лид"},
  {id:"contact",     name:"Контакт"},
  {id:"consult",     name:"Консультация"},
  {id:"kp",          name:"КП / Накладная"},
  {id:"pay",         name:"Оплата"},
  {id:"delivery",    name:"Доставка"},
  {id:"install",     name:"Установка"},
];

// построить колонки (+ Свернуть/Развернуть)
const kanbanEl = $("#kanban");
function renderColumns(){
  const collapsed = JSON.parse(localStorage.getItem('od_collapsed')||'[]');
  kanbanEl.innerHTML = STAGES.map(s=>`
    <section class="od-col ${collapsed.includes(s.id)?'collapsed':''}" data-stage="${s.id}">
      <header>
        <span>${s.name}</span>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="count">0</span>
          <button class="collapse" data-collapse="${s.id}">${collapsed.includes(s.id)?'Развернуть':'Свернуть'}</button>
        </div>
      </header>
      <div class="list" data-drop="${s.id}"></div>
    </section>
  `).join("");
}
renderColumns();

kanbanEl.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-collapse]');
  if(!btn) return;
  const id = btn.dataset.collapse;
  const col = kanbanEl.querySelector(`.od-col[data-stage="${id}"]`);
  col.classList.toggle('collapsed');
  const collapsed = new Set(JSON.parse(localStorage.getItem('od_collapsed')||'[]'));
  if(col.classList.contains('collapsed')) collapsed.add(id); else collapsed.delete(id);
  localStorage.setItem('od_collapsed', JSON.stringify([...collapsed]));
  btn.textContent = col.classList.contains('collapsed') ? 'Развернуть' : 'Свернуть';
});

// вход
const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
loginBtn?.addEventListener("click", async ()=>{
  try{
    if(isStandalone) await signInWithRedirect(auth, provider);
    else await signInWithPopup(auth, provider);
  }catch(e){
    if(e.code==="auth/popup-blocked") await signInWithRedirect(auth, provider);
    else alert("Ошибка входа: "+(e.message||e));
  }
});
logoutBtn?.addEventListener("click", ()=>signOut(auth));
getRedirectResult(auth).catch(()=>{});

// состояние
let currentUser=null;
onAuthStateChanged(auth, (user)=>{
  currentUser=user;
  if(user){
    loginBtn?.classList.add("hidden");
    userChip?.classList.remove("hidden");
    if(userName) userName.textContent = user.displayName || user.email;
    document.body.classList.add("authed");
    startRealtime();      // сделки + отчёты
    subscribeClients();   // клиенты + настройки
  }else{
    document.body.classList.remove("authed");
    userChip?.classList.add("hidden");
    loginBtn?.classList.remove("hidden");
    stopRealtime();
  }
});

// ---- Сделки realtime + отчёты
const unsub = { deals: null };
function startRealtime(){
  stopRealtime();
  const q = query(collection(db,"leads"), orderBy("createdAt","desc"));
  unsub.deals = onSnapshot(q, snap=>{
    const deals = snap.docs.map(d=>({id:d.id, ...d.data()}));
    redrawDeals(deals);
    renderReports(deals);
  });
}
function stopRealtime(){ if(unsub.deals){unsub.deals();unsub.deals=null;} }

function renderCard(d){
  const el = document.createElement("article");
  el.className="od-card"; el.draggable=true; el.dataset.id=d.id;
  const phone = d.phone||'';
  el.innerHTML = `
    <button class="del" title="Удалить" data-del="${d.id}">✕</button>
    <div class="title">${d.client||"Без имени"}</div>
    <div class="meta">
      <a href="${waHref(phone,d.client)}" target="_blank" rel="noopener">📱 ${phone||''}</a>
      <span class="badge">${d.source||""}</span>
      <span class="badge${d.budget? ' badge--ok':''}">${d.budget? money(d.budget):"—"}</span>
    </div>
  `;
  return el;
}

async function deleteLead(id){
  if(!confirm("Удалить эту сделку?")) return;
  try{ await deleteDoc(doc(db,'leads',id)); }catch(e){ alert('Не удалось удалить: '+(e.message||e)); }
}

function enableDnD(){
  $$(".od-card").forEach(card=>{
    card.addEventListener("dragstart", e=>{
      e.dataTransfer.setData("text/plain", card.dataset.id);
    });
    // delete button
    card.addEventListener("click", (e)=>{
      const del = e.target.closest('[data-del]');
      if(del){ deleteLead(del.dataset.del); e.stopPropagation(); }
    });
  });
  $$(".list").forEach(list=>{
    list.addEventListener("dragover", e=>{ e.preventDefault(); list.style.outline="2px dashed var(--brand)"; });
    list.addEventListener("dragleave", ()=> list.style.outline="none");
    list.addEventListener("drop", async e=>{
      e.preventDefault(); list.style.outline="none";
      const id = e.dataTransfer.getData("text/plain");
      const newStage = list.dataset.drop;
      try{
        await updateDoc(doc(db,"leads",id), { stage:newStage, updatedAt:serverTimestamp(), managerId: currentUser?.uid || null });
      }catch(err){ alert("Не удалось переместить: "+(err.message||err)); }
    });
  });
}

function redrawDeals(deals){
  renderColumns(); // учесть свёртку
  $$(".od-col .count").forEach(el=>el.textContent="0");
  const dealList = $("#dealList"); dealList.innerHTML="";
  deals.forEach(d=>{
    const colList = document.querySelector(`.od-col[data-stage="${d.stage||'lead'}"] .list`) || document.querySelector(`.od-col[data-stage="lead"] .list`);
    if(colList){
      const card = renderCard(d);
      colList.appendChild(card);
      const cnt= colList.closest(".od-col").querySelector(".count");
      if(cnt) cnt.textContent = (+cnt.textContent+1).toString();
    }
    // список строкой (с удалением)
    const row = document.createElement('div');
    row.className = 'row';
    const extra = [];
    if(d.address) extra.push(d.address);
    if(d.city) extra.push(d.city);
    if(d.email) extra.push(d.email);
    row.innerHTML = `<div><b>${d.client||'Без имени'}</b> · <span class="badge">${d.stage}</span> · <a href="${waHref(d.phone,d.client)}" target="_blank" rel="noopener">${d.phone||''}</a>
                     ${extra.length?`<small>${extra.join(' · ')}</small>`:''}</div>
                     <div class="row-actions">
                       <button class="od-edit" data-del-lead="${d.id}">Удалить</button>
                     </div>`;
    dealList.appendChild(row);
  });
  // делегируем удаление в списке
  dealList.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-del-lead]');
    if(btn){ deleteLead(btn.dataset.delLead); }
  }, { once: true });
  enableDnD();
}

// ---- Новая сделка + upsert клиента
addDealBtn?.addEventListener("click", ()=>dealDialog.showModal());
async function upsertClient({name, phone, source}){
  const norm = normalizePhoneForWA(phone);
  try{
    const q = query(collection(db,'clients'), where('phoneNorm','==', norm), limit(1));
    const s = await getDocs(q);
    if(!s.empty){
      const id = s.docs[0].id;
      await updateDoc(doc(db,'clients',id), { name, phone, phoneNorm:norm, source, updatedAt: serverTimestamp() });
      return id;
    }else{
      const ref = await addDoc(collection(db,'clients'), {
        name, phone, phoneNorm:norm, source,
        email:'', city:'', address:'', note:'',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      return ref.id;
    }
  }catch(e){ console.warn('upsertClient error', e); return null; }
}
dlgSave?.addEventListener("click", async (e)=>{
  e.preventDefault();
  const data = {
    client: $("#dlgClient").value.trim(),
    phone:  $("#dlgPhone").value.trim(),
    budget: Number($("#dlgBudget").value.replace(/\s|₸/g,""))||0,
    source: $("#dlgSource").value,
    stage: "lead",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    managerId: currentUser?.uid || null
  };
  if(!data.client){ $("#dlgClient").focus(); return; }
  try{
    const clientId = await upsertClient({name:data.client, phone:data.phone, source:data.source});
    await addDoc(collection(db,"leads"), {...data, clientId: clientId || null});
    dealDialog.close();
  }catch(err){
    alert("Ошибка сохранения: "+(err.message||err));
  }
});

// ---- Клиенты (список + настройки редактировать + просмотр и удаление)
let _clients = [];
const settingsClientList = $("#settingsClientList");
const clientList = $("#clientList");
function renderClientsList(targetEl, list, withOpen=false){
  targetEl.innerHTML="";
  list.forEach(c=>{
    const row = document.createElement('div');
    row.className='row';
    const line2 = [c.city, c.address, c.email].filter(Boolean).join(' · ');
    row.innerHTML = `<div ${withOpen?`data-open="${c.id}" style="cursor:pointer"`:""}>
                       <b>${c.name||'—'}</b> · <a href="${waHref(c.phone,c.name)}" target="_blank" rel="noopener">${c.phone||''}</a> · <span class="badge">${c.source||''}</span>
                       ${line2?`<small>${line2}</small>`:''}
                     </div>
                     <div class="row-actions">
                       ${withOpen?'<button class="od-edit" data-open="'+c.id+'">Открыть</button>':''}
                       <button class="od-edit danger" data-del-client="${c.id}">Удалить</button>
                     </div>`;
    targetEl.appendChild(row);
  });
}
function subscribeClients(){
  const q = query(collection(db,'clients'), orderBy('createdAt','desc'));
  onSnapshot(q, snap=>{
    _clients = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderClientsList(clientList, _clients, true);
    renderClientsList(settingsClientList, _clients, false);
  });
}
function filterClients(qs){
  const q=qs.toLowerCase();
  return _clients.filter(c=>(c.name||'').toLowerCase().includes(q) || (c.phone||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q) || (c.city||'').toLowerCase().includes(q));
}
$("#clientSearch").addEventListener('input', e=>{ renderClientsList(clientList, filterClients(e.target.value), true); });
$("#settingsClientSearch").addEventListener('input', e=>{ renderClientsList(settingsClientList, filterClients(e.target.value), false); });

// View card dialog
const cv = {
  dialog: $("#clientView"),
  name: $("#cvName"),
  meta: $("#cvMeta"),
  wa:   $("#cvWA"),
  call: $("#cvCall"),
  edit: $("#cvEdit"),
  del:  $("#cvDelete"),
  close:$("#cvClose"),
  currentId: null
};
function openClientView(id){
  const c = _clients.find(x=>x.id===id); if(!c) return;
  cv.currentId = id;
  cv.name.textContent = c.name || 'Клиент';
  const parts = [];
  if(c.phone) parts.push(`Тел: ${c.phone}`);
  if(c.email) parts.push(`Email: ${c.email}`);
  if(c.city) parts.push(`Город: ${c.city}`);
  if(c.address) parts.push(`Адрес: ${c.address}`);
  parts.push(`Источник: ${c.source||'—'}`);
  if(c.note) parts.push(`Заметка: ${c.note}`);
  cv.meta.textContent = parts.join(' · ');
  cv.wa.href   = waHref(c.phone, c.name);
  cv.call.href = `tel:${c.phone||''}`;
  cv.dialog.showModal();
}
clientList.addEventListener('click', (e)=>{
  const openBtn = e.target.closest('[data-open]');
  if(openBtn){ openClientView(openBtn.dataset.open); }
});
cv.close.addEventListener('click', ()=> cv.dialog.close());
cv.edit.addEventListener('click', (e)=>{
  e.preventDefault();
  if(!cv.currentId) return;
  const c = _clients.find(x=>x.id===cv.currentId); if(!c) return;
  $("#clId").value = c.id;
  $("#clName").value = c.name||'';
  $("#clPhone").value = c.phone||'';
  $("#clEmail").value = c.email||'';
  $("#clCity").value  = c.city||'';
  $("#clAddress").value = c.address||'';
  $("#clSource").value = c.source||'Instagram';
  $("#clNote").value   = c.note||'';
  cv.dialog.close();
  $("#clientDialog").showModal();
});
async function deleteClient(id){
  // проверим наличие сделок
  const c = _clients.find(x=>x.id===id);
  if(!c){ alert('Клиент не найден'); return; }
  const norm = c.phoneNorm || normalizePhoneForWA(c.phone);
  let hasLeads=false;
  try{
    const q1 = query(collection(db,'leads'), where('clientId','==', id), limit(1));
    const q2 = query(collection(db,'leads'), where('phone','==', c.phone||''), limit(1));
    const s1 = await getDocs(q1); const s2 = await getDocs(q2);
    hasLeads = !s1.empty || !s2.empty;
  }catch{}
  const ok = confirm(`Удалить клиента${hasLeads?' (есть сделки!)':''}?`);
  if(!ok) return;
  try{ await deleteDoc(doc(db,'clients',id)); cv.dialog.close(); }catch(e){ alert('Не удалось удалить: '+(e.message||e)); }
}
clientList.addEventListener('click', (e)=>{
  const del = e.target.closest('[data-del-client]');
  if(del){ deleteClient(del.dataset.delClient); }
});
settingsClientList.addEventListener('click', (e)=>{
  const del = e.target.closest('[data-del-client]');
  if(del){ deleteClient(del.dataset.delClient); }
});

// ---- Отчёты
function isToday(ts){
  if(!ts || !ts.toDate) return false;
  const d = ts.toDate();
  const t = new Date();
  return d.getFullYear()===t.getFullYear() && d.getMonth()===t.getMonth() && d.getDate()===t.getDate();
}
function renderReports(deals){
  const todayDone = deals.filter(d=> (d.stage==='install') && isToday(d.updatedAt));
  const cnt = todayDone.length;
  const sum = todayDone.reduce((a,b)=>a+(Number(b.budget)||0),0);
  $("#r-today-count").textContent = String(cnt);
  $("#r-today-sum").textContent   = money(sum);
  $("#r-today-avg").textContent   = cnt? money(Math.round(sum/cnt)) : '0 ₸';

  const bySrc = {};
  deals.forEach(d=>{
    const s = d.source||'—';
    bySrc[s] = bySrc[s] || {total:0, won:0};
    bySrc[s].total++;
    if(d.stage==='install') bySrc[s].won++;
  });
  const wrap = $("#r-sources");
  wrap.innerHTML = "";
  Object.entries(bySrc).sort((a,b)=>b[1].total - a[1].total).forEach(([src, v])=>{
    const conv = v.total? Math.round(v.won/v.total*100) : 0;
    const row = document.createElement('div');
    row.className = 'q-row';
    row.innerHTML = `
      <div>${src}</div>
      <div class="q-bg"><div class="q-bar" style="width:${conv}%;"></div></div>
      <div>${v.total} лид.</div>
      <div>${conv}%</div>
    `;
    wrap.appendChild(row);
  });
}

// SW
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js');
}
