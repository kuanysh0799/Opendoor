import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  initializeAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, browserLocalPersistence, indexedDBLocalPersistence,
  browserSessionPersistence, browserPopupRedirectResolver, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, query, orderBy, limit, serverTimestamp
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

// Theme
$("#themeBtn")?.addEventListener("click", ()=> document.body.classList.toggle("light"));
$("#themeToggle")?.addEventListener("click", ()=> document.body.classList.toggle("light"));

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
    if (isIOS || isSafari || isStandalone) {
      await signInWithRedirect(auth, provider);
    } else {
      await signInWithPopup(auth, provider);
    }
  } catch (e) { alert("Ошибка входа: " + e.message); }
});
$("#signOutBtn")?.addEventListener("click", async()=>{ if(auth.currentUser) await signOut(auth); });
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

// Auth state + show role
onAuthStateChanged(auth, async (u) => {
  $("#authBtn").textContent = u ? (u.displayName || u.email || "Выйти") : "Войти";
  $("#fab").style.display = u ? "block" : "none";
  if (u) {
    await ensureUserProfile(u);
    const snap = await getDoc(doc(db, "users", u.uid));
    if (snap.exists()) { $("#userRole").textContent = snap.data().role || "—"; }
    loadDeals(); renderStages();
  } else {
    $("#dealsList").innerHTML=''; $("#stages").innerHTML=''; $("#userRole").textContent = "—";
  }
});

// Pipeline
const STAGES = ['Лид','Контакт','Консультация','КП / Накладная','Оплата','Доставка','Установка'];
function renderStages(){
  const wrap = $("#stages"); if(!wrap) return; wrap.innerHTML='';
  STAGES.forEach(s=>{
    const el=document.createElement('div'); el.className='stage'; el.innerHTML=`<h4>${s}</h4><div class="cards"></div>`;
    wrap.appendChild(el);
  });
  placeDealsOnStages();
}

// Deals
async function loadDeals(){
  const list = $("#dealsList"); if(!list) return; list.innerHTML='';
  try{
    const q = query(collection(db,'deals'), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    const deals=[]; snap.forEach(d=>deals.push({id:d.id, ...d.data()}));
    window._deals = deals; renderDeals(deals); placeDealsOnStages();
  }catch(e){
    console.error(e); list.innerHTML='<div class="empty">Нет доступа или данные недоступны.</div>';
  }
}
function renderDeals(deals){
  const list = $("#dealsList"); if(!list) return; list.innerHTML='';
  deals.forEach(d=>{
    const card=document.createElement('div'); card.className='card';
    card.innerHTML = `
      <span class="badge">${d.stage||'Лид'}</span>
      <h5>${d.customer?.name||'Клиент'}</h5>
      <div class="meta">${d.customer?.phone||''}</div>
      <div class="meta">Сумма: ${(d.totals?.amount||0).toLocaleString('ru-RU')} ${d.totals?.currency||'KZT'}</div>`;
    list.appendChild(card);
  });
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
                 <div class="meta">${d.customer?.phone||''}</div>
                 <div class="meta">Сумма: ${(d.totals?.amount||0).toLocaleString('ru-RU')} ${d.totals?.currency||'KZT'}</div>`;
    col.appendChild(c);
  });
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
  const deal = {
    customer:{name:$("#custName").value.trim()||"Клиент", phone:$("#custPhone").value.trim()},
    items:[], totals:{amount:parseInt($("#amount").value||"0"), currency:"KZT"},
    payment:{status:"pending", method:"", approved:false},
    delivery:{date:"", time:"", status:"scheduled"},
    warehouse:{reserved:false,reservedBy:""},
    stage:"Лид", managerId:u.uid, createdAt: serverTimestamp()
  };
  try{
    await addDoc(collection(db,'deals'), deal);
    $("#dealDialog").close(); $("#custName").value=""; $("#custPhone").value=""; $("#amount").value="";
    loadDeals();
  }catch(e){
    console.error("save deal error:", e);
    const offlineCodes = ['unavailable', 'failed-precondition'];
    if (offlineCodes.includes(e.code)) {
      const q = JSON.parse(localStorage.getItem('od_queue')||'[]');
      q.push({type:'deal', payload:deal});
      localStorage.setItem('od_queue', JSON.stringify(q));
      alert("Нет сети — сделка будет отправлена при подключении");
    } else if (e.code === 'permission-denied') {
      alert("Нет прав на запись. Войдите через Google и проверьте правила Firestore.");
    } else if (!auth.currentUser) {
      alert("Сначала войдите через Google.");
    } else {
      alert("Ошибка сохранения: " + (e.message||e.code));
    }
    $("#dealDialog").close();
  }
});

// Retry offline queue
window.addEventListener('online', async()=>{
  const q = JSON.parse(localStorage.getItem('od_queue')||'[]'); if(!q.length) return;
  const keep=[]; for(const it of q){ try{ if(it.type==='deal') await addDoc(collection(db,'deals'), it.payload); }catch{ keep.push(it); } }
  localStorage.setItem('od_queue', JSON.stringify(keep)); loadDeals();
});
