import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const provider = new GoogleAuthProvider();

// UI helpers
const $=(s,e=document)=>e.querySelector(s); const $$=(s,e=document)=>e.querySelectorAll(s);
const toast = (t)=>{ console.log(t); };

// Theme
$('#themeBtn').addEventListener('click', ()=> document.body.classList.toggle('light'));
$('#themeToggle').addEventListener('click', ()=> document.body.classList.toggle('light'));

// Tabs
$$('.pill-tabs .pill').forEach(b=>b.addEventListener('click',()=>{
  $$('.pill-tabs .pill').forEach(x=>x.classList.toggle('active',x===b));
  const t=b.dataset.tab; $$('.pane').forEach(p=>p.classList.toggle('active',p.id===t));
}));

// PWA install prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden=false; });
$('#installBtn').addEventListener('click', async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; $('#installBtn').hidden=true; }});

// Auth
$('#authBtn').addEventListener('click', async()=>{
  if(auth.currentUser){ await signOut(auth); return; }
  try{ await signInWithPopup(auth, provider); }catch(e){ alert('Ошибка входа: '+e.message); }
});
$('#signOutBtn').addEventListener('click', async()=>{ if(auth.currentUser) await signOut(auth); });

onAuthStateChanged(auth, (u)=>{
  $('#authBtn').textContent = u ? (u.displayName||u.email) : 'Войти';
  $('#fab').style.display = u ? 'block':'none';
  if(u) { loadDeals(); renderStages(); } else { $('#dealsList').innerHTML=''; $('#stages').innerHTML=''; }
});

// Pipeline stages
const STAGES = ['Лид','Контакт','Консультация','КП / Накладная','Оплата','Доставка','Установка'];
function renderStages(){
  const wrap = $('#stages'); wrap.innerHTML='';
  STAGES.forEach(s=>{
    const el=document.createElement('div'); el.className='stage'; el.innerHTML=`<h4>${s}</h4><div class="cards"></div>`;
    wrap.appendChild(el);
  });
  // Накидываем существующие сделки (после loadDeals заполним)
  placeDealsOnStages();
}

// Load deals
async function loadDeals(){
  const list = $('#dealsList'); list.innerHTML='';
  try{
    const q = query(collection(db,'deals'), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    const deals = [];
    snap.forEach(d=>deals.push({id:d.id, ...d.data()}));
    window._deals = deals;
    renderDeals(deals);
    placeDealsOnStages();
  }catch(e){ console.error(e); list.innerHTML='<div class="empty">Нет доступа или данные недоступны.</div>'; }
}

function renderDeals(deals){
  const list = $('#dealsList'); list.innerHTML='';
  deals.forEach(d=>{
    const card=document.createElement('div'); card.className='card';
    card.innerHTML=`
      <span class="badge">${d.stage||'Лид'}</span>
      <h5>${d.customer?.name||'Клиент'}</h5>
      <div class="meta">${d.customer?.phone||''}</div>
      <div class="meta">Сумма: ${(d.totals?.amount||0).toLocaleString('ru-RU')} ${d.totals?.currency||'KZT'}</div>
    `;
    list.appendChild(card);
  });
}

// Place deals in stages board
function placeDealsOnStages(){
  if(!window._deals) return;
  const wrap = $('#stages'); if(!wrap) return;
  wrap.querySelectorAll('.stage .cards').forEach(c=>c.innerHTML='');
  window._deals.forEach(d=>{
    const idx = Math.max(0, STAGES.indexOf(d.stage||'Лид'));
    const col = wrap.querySelectorAll('.stage .cards')[idx];
    if(!col) return;
    const c=document.createElement('div'); c.className='card';
    c.innerHTML=`<h5>${d.customer?.name||'Клиент'}</h5><div class="meta">${d.customer?.phone||''}</div><div class="meta">Сумма: ${(d.totals?.amount||0).toLocaleString('ru-RU')} ${d.totals?.currency||'KZT'}</div>`;
    col.appendChild(c);
  });
}

// Search
$('#dealSearch').addEventListener('input', (e)=>{
  const q = e.target.value.toLowerCase();
  const filtered = (window._deals||[]).filter(d=>(d.customer?.name||'').toLowerCase().includes(q) || (d.customer?.phone||'').includes(q));
  renderDeals(filtered);
});

// Create deal modal
$('#fab').addEventListener('click', ()=> $('#dealDialog').showModal());
$('#dealDialog').addEventListener('close', ()=>{});
$('#dealSave').addEventListener('click', async (ev)=>{
  ev.preventDefault();
  const u = auth.currentUser; if(!u){ alert('Сначала войдите'); return; }
  const deal = {
    customer:{name:$('#custName').value.trim()||'Клиент', phone:$('#custPhone').value.trim()},
    items:[], totals:{amount:parseInt($('#amount').value||'0'), currency:'KZT'},
    payment:{status:'pending', method:'', approved:false},
    delivery:{date:'', time:'', status:'scheduled'},
    warehouse:{reserved:false,reservedBy:''},
    stage:'Лид', managerId:u.uid, createdAt: serverTimestamp()
  };
  try{
    await addDoc(collection(db,'deals'), deal);
    toast('Сделка создана'); $('#dealDialog').close(); $('#custName').value=''; $('#custPhone').value=''; $('#amount').value='';
    loadDeals();
  }catch(e){
    // офлайн очередь
    const q = JSON.parse(localStorage.getItem('od_queue')||'[]'); q.push({type:'deal', payload:deal}); localStorage.setItem('od_queue', JSON.stringify(q));
    alert('Нет сети — сделка будет отправлена при подключении');
    $('#dealDialog').close();
  }
});

// Retry offline queue
window.addEventListener('online', async()=>{
  const q = JSON.parse(localStorage.getItem('od_queue')||'[]'); if(!q.length) return;
  const remain=[];
  for(const item of q){
    try{
      if(item.type==='deal'){ await addDoc(collection(db,'deals'), item.payload); }
    }catch(e){ remain.push(item); }
  }
  localStorage.setItem('od_queue', JSON.stringify(remain));
  loadDeals();
});
