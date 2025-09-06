import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  initializeAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, browserLocalPersistence, indexedDBLocalPersistence,
  browserSessionPersistence, browserPopupRedirectResolver, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc,
  query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Init
const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
  popupRedirectResolver: browserPopupRedirectResolver
});
const db   = getFirestore(app);
const provider = new GoogleAuthProvider();

const $=(s,e=document)=>e.querySelector(s); const $$=(s,e=document)=>e.querySelectorAll(s);

// Tabs
$$(".pill-tabs .pill").forEach(b=>b.addEventListener("click",()=>{
  $$(".pill-tabs .pill").forEach(x=>x.classList.toggle("active",x===b));
  const t=b.dataset.tab; $$(".pane").forEach(p=>p.classList.toggle("active",p.id===t));
}));

// iOS/Safari detection
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// Auth button
$("#authBtn")?.addEventListener("click", async () => {
  if (auth.currentUser) { await signOut(auth); return; }
  try {
    if (isIOS || isSafari || isStandalone) { await signInWithRedirect(auth, provider); }
    else { await signInWithPopup(auth, provider); }
  } catch (e) { alert("Ошибка входа: " + e.message); }
});
getRedirectResult(auth).catch(()=>{});

// Auto-role: first user = owner, others = manager
async function ensureUserProfile(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  const anyUser = await getDocs(query(collection(db, 'users'), limit(1)));
  const role = anyUser.empty ? 'owner' : 'manager';
  await setDoc(ref, {
    name: user.displayName || '',
    email: user.email || '',
    phone: user.phoneNumber || '',
    role,
    createdAt: serverTimestamp()
  });
  console.log('Профиль создан. Роль:', role);
}

// Auth state
onAuthStateChanged(auth, async (u) => {
  $("#authBtn").textContent = u ? (u.displayName || u.email || "Выйти") : "Войти";
  $("#fab").style.display = u ? "block" : "none";
  if (u) { await ensureUserProfile(u); loadAll(); }
  else { ["dealsList","stages","clientsList"].forEach(id=>{const el=$("#"+id); if(el) el.innerHTML="";}); }
});

// Pipeline
const STAGES = ['Лид','Контакт','Консультация','КП / Накладная','Оплата','Доставка','Установка'];

async function loadAll(){ await Promise.all([loadDeals(), loadClients(), renderStages()]); }

// Deals
async function loadDeals(){
  const list = $("#dealsList"); if(!list) return; list.innerHTML='';
  try{
    const qy = query(collection(db,'deals'), orderBy('createdAt','desc'));
    const snap = await getDocs(qy);
    const deals=[]; snap.forEach(d=>deals.push({id:d.id, ...d.data()}));
    window._deals = deals; renderDeals(deals); placeDealsOnStages();
  }catch(e){ console.error(e); list.innerHTML='<div class="empty">Нет доступа или данные недоступны.</div>'; }
}
function renderDeals(deals){
  const list = $("#dealsList"); if(!list) return; list.innerHTML='';
  deals.forEach(d=>{
    const card=document.createElement('div'); card.className='card';
    card.innerHTML = `
      <span class="badge">${d.stage||'Лид'}</span>
      <h5>${d.customer?.name||'Клиент'}</h5>
      <div class="meta"><a class="wa" data-phone="${d.customer?.phone||''}" href="#">${d.customer?.phone||''}</a></div>
      <div class="meta">Сумма: ${(d.totals?.amount||0).toLocaleString('ru-RU')} ${d.totals?.currency||'KZT'}</div>
      <div class="actions"><button class="btn ok" data-id="${d.id}">Дальше →</button></div>`;
    list.appendChild(card);
  });
  // bind next stage
  list.querySelectorAll('.btn.ok').forEach(b=>b.addEventListener('click',()=>advanceStage(b.dataset.id)));
  // bind whatsapp
  list.querySelectorAll('a.wa').forEach(a=>a.addEventListener('click',(e)=>{e.preventDefault(); openWhatsApp(a.dataset.phone);}));
}

async function advanceStage(id){
  const d = (window._deals||[]).find(x=>x.id===id); if(!d) return;
  const idx = Math.min(STAGES.length-1, Math.max(0, STAGES.indexOf(d.stage||'Лид')) + 1);
  await updateDoc(doc(db,'deals',id), { stage: STAGES[idx] });
  await loadAll();
}

function renderStages(){
  const wrap = $("#stages"); if(!wrap) return; wrap.innerHTML='';
  STAGES.forEach(s=>{
    const el=document.createElement('div'); el.className='stage'; el.innerHTML=`<h4>${s}</h4><div class="cards"></div>`;
    wrap.appendChild(el);
  });
  placeDealsOnStages();
}
function placeDealsOnStages(){
  if(!window._deals) return;
  const wrap = $("#stages"); if(!wrap) return;
  wrap.querySelectorAll('.stage .cards').forEach(c=>c.innerHTML='');
  window._deals.forEach(d=>{
    const idx = Math.max(0, STAGES.indexOf(d.stage||'Лид'));
    const col = wrap.querySelectorAll('.stage .cards')[idx];
    if(!col) return;
    const c=document.createElement('div'); c.className='card';
    c.innerHTML=`<h5>${d.customer?.name||'Клиент'}</h5>
                 <div class="meta"><a class="wa" data-phone="${d.customer?.phone||''}" href="#">${d.customer?.phone||''}</a></div>
                 <div class="meta">Сумма: ${(d.totals?.amount||0).toLocaleString('ru-RU')} ${d.totals?.currency||'KZT'}</div>
                 <div class="actions"><button class="btn ok" data-id="${d.id}">Дальше →</button></div>`;
    col.appendChild(c);
  });
  // bind
  wrap.querySelectorAll('.btn.ok').forEach(b=>b.addEventListener('click',()=>advanceStage(b.dataset.id)));
  wrap.querySelectorAll('a.wa').forEach(a=>a.addEventListener('click',(e)=>{e.preventDefault(); openWhatsApp(a.dataset.phone);}));
}

// Search
$("#dealSearch")?.addEventListener("input",(e)=>{
  const q = e.target.value.toLowerCase();
  const filtered = (window._deals||[]).filter(d=>(d.customer?.name||'').toLowerCase().includes(q) || (d.customer?.phone||'').includes(q));
  renderDeals(filtered);
});

// Create deal
$("#fab")?.addEventListener("click", ()=> $("#dealDialog").showModal());
$("#dealSave")?.addEventListener("click", async (ev)=>{
  ev.preventDefault();
  const u = auth.currentUser; if(!u){ alert("Сначала войдите"); return; }
  const name=$("#custName").value.trim()||"Клиент";
  const phone=$("#custPhone").value.trim();
  const deal = {
    customer:{name, phone},
    items:[], totals:{amount:parseInt($("#amount").value||"0"), currency:"KZT"},
    payment:{status:"pending"}, delivery:{date:"", time:"", status:"scheduled"},
    warehouse:{reserved:false,reservedBy:""},
    stage:"Лид", managerId:u.uid, createdAt: serverTimestamp()
  };
  try{
    const ref = await addDoc(collection(db,'deals'), deal);
    // upsert client
    const cid = phone || name.toLowerCase().replace(/\s+/g,'_');
    await setDoc(doc(db,'clients', cid), {
      name, phone, lastDealId: ref.id, updatedAt: serverTimestamp()
    }, { merge: true });
    $("#dealDialog").close(); $("#custName").value=""; $("#custPhone").value=""; $("#amount").value="";
    await loadAll();
  }catch(e){
    alert("Ошибка сохранения: " + (e.message||e.code));
    $("#dealDialog").close();
  }
});

// Clients
async function loadClients(){
  const list = $("#clientsList"); if(!list) return; list.innerHTML='';
  try{
    const snap = await getDocs(query(collection(db,'clients'), orderBy('updatedAt','desc')));
    const items=[]; snap.forEach(d=>items.push({id:d.id, ...d.data()}));
    window._clients = items;
    items.forEach(c=>{
      const card=document.createElement('div'); card.className='card';
      card.innerHTML=`<h5>${c.name||'Клиент'}</h5>
                      <div class="meta"><a class="wa" data-phone="${c.phone||''}" href="#">${c.phone||''}</a></div>
                      <div class="actions"><button class="btn" data-id="${c.id}">Открыть карточку</button></div>`;
      list.appendChild(card);
    });
    // bind
    list.querySelectorAll('a.wa').forEach(a=>a.addEventListener('click',(e)=>{e.preventDefault(); openWhatsApp(a.dataset.phone);}));
    list.querySelectorAll('.btn').forEach(b=>b.addEventListener('click',()=>openClient(b.dataset.id)));
  }catch(e){ list.innerHTML='<div class="empty">Клиенты недоступны.</div>'; }
}

function openClient(id){
  const c = (window._clients||[]).find(x=>x.id===id); if(!c) return;
  $("#clientTitle").textContent = c.name || "Клиент";
  const info = $("#clientInfo");
  info.innerHTML = `
    <div><b>Телефон:</b> <a class="wa" data-phone="${c.phone||''}" href="#">${c.phone||''}</a></div>
    <div><b>ID:</b> ${id}</div>
    <div><b>Последняя сделка:</b> ${c.lastDealId||'—'}</div>`;
  $("#whatsappBtn").href = getWaLink(c.phone||"");
  $("#clientDialog").showModal();
  info.querySelector('a.wa')?.addEventListener('click',(e)=>{e.preventDefault(); openWhatsApp(c.phone||"");});
}

// WhatsApp open
function getWaLink(phone){ const digits=(phone||'').replace(/\D/g,''); return digits?`https://wa.me/${digits}`:'https://wa.me/'; }
function openWhatsApp(phone){ window.open(getWaLink(phone), '_blank'); }

// Export CSV
$("#exportCsv")?.addEventListener("click", ()=>{
  const rows = [["id","stage","customer_name","customer_phone","amount","currency"]];
  (window._deals||[]).forEach(d=>{
    rows.push([d.id, d.stage||"", d.customer?.name||"", d.customer?.phone||"", d.totals?.amount||0, d.totals?.currency||"KZT"]);
  });
  const csv = rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "deals_export.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
});
