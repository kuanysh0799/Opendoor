// app.js — WhatsApp, collapsible, reports, edit clients
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, setPersistence, browserLocalPersistence, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence, addDoc, collection, serverTimestamp, query, orderBy, onSnapshot, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(()=>{});
enableIndexedDbPersistence(db).catch(()=>{});
const provider = new GoogleAuthProvider();

const $=(s,e=document)=>e.querySelector(s), $$=(s,e=document)=>[...e.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'KZT',maximumFractionDigits:0}).format(n||0);

const loginBtn=$("#loginBtn"), logoutBtn=$("#logoutBtn"), userChip=$("#userChip"), userName=$("#userName");
const addDealBtn=$("#addDealBtn"), dealDialog=$("#dealDialog"), dlgSave=$("#dlgSave");

const STAGES=[{id:"lead",name:"Лид"},{id:"contact",name:"Контакт"},{id:"consult",name:"Консультация"},{id:"kp",name:"КП / Накладная"},{id:"pay",name:"Оплата"},{id:"delivery",name:"Доставка"},{id:"install",name:"Установка"}];

const kanbanEl=$("#kanban");
function renderColumns(){
  const collapsed=JSON.parse(localStorage.getItem('od_collapsed')||'[]');
  kanbanEl.innerHTML=STAGES.map(s=>`<section class="od-col ${collapsed.includes(s.id)?'collapsed':''}" data-stage="${s.id}">
    <header><span>${s.name}</span>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="count">0</span>
        <button class="collapse" data-collapse="${s.id}">${collapsed.includes(s.id)?'Развернуть':'Свернуть'}</button>
      </div>
    </header>
    <div class="list" data-drop="${s.id}"></div>
  </section>`).join("");
}
renderColumns();
kanbanEl.addEventListener('click',e=>{
  const b=e.target.closest('[data-collapse]'); if(!b)return;
  const id=b.dataset.collapse, col=kanbanEl.querySelector(`.od-col[data-stage="${id}"]`);
  col.classList.toggle('collapsed');
  const set=new Set(JSON.parse(localStorage.getItem('od_collapsed')||'[]'));
  if(col.classList.contains('collapsed')) set.add(id); else set.delete(id);
  localStorage.setItem('od_collapsed',JSON.stringify([...set]));
  b.textContent=col.classList.contains('collapsed')?'Развернуть':'Свернуть';
});

const isStandalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone;
loginBtn?.addEventListener("click",async()=>{try{if(isStandalone)await signInWithRedirect(auth,new GoogleAuthProvider());else await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){if(e.code==="auth/popup-blocked")await signInWithRedirect(auth,new GoogleAuthProvider());else alert("Ошибка входа: "+(e.message||e))}});
logoutBtn?.addEventListener("click",()=>signOut(auth));
getRedirectResult(auth).catch(()=>{});

let currentUser=null;
onAuthStateChanged(auth,u=>{
  currentUser=u;
  if(u){loginBtn?.classList.add("hidden");userChip?.classList.remove("hidden");if(userName)userName.textContent=u.displayName||u.email;document.body.classList.add("authed");startRealtime();subscribeClients();}
  else{document.body.classList.remove("authed");userChip?.classList.add("hidden");loginBtn?.classList.remove("hidden");stopRealtime();}
});

const unsub={deals:null};
function startRealtime(){
  stopRealtime();
  const q=query(collection(db,"leads"),orderBy("createdAt","desc"));
  unsub.deals=onSnapshot(q,snap=>{const deals=snap.docs.map(d=>({id:d.id,...d.data()})); redrawDeals(deals); renderReports(deals);});
}
function stopRealtime(){if(unsub.deals){unsub.deals();unsub.deals=null;}}

const sanitizePhone=p=>(p||'').replace(/[^\d]/g,'');
const waHref=(phone,client)=>{const num=sanitizePhone(phone);const text=encodeURIComponent(`Здравствуйте, ${client||''}`.trim());return num?`https://wa.me/${num}?text=${text}`:'#';};

function renderCard(d){
  const el=document.createElement("article"); el.className="od-card"; el.draggable=true; el.dataset.id=d.id;
  const phone=d.phone||'';
  el.innerHTML=`<div class="title">${d.client||"Без имени"}</div>
    <div class="meta"><a href="${waHref(phone,d.client)}" target="_blank" rel="noopener">📱 ${phone||''}</a>
      <span class="badge">${d.source||""}</span>
      <span class="badge${d.budget?' badge--ok':''}">${d.budget?money(d.budget):"—"}</span></div>`;
  return el;
}
function enableDnD(){
  $$(".od-card").forEach(card=>card.addEventListener("dragstart",e=>e.dataTransfer.setData("text/plain",card.dataset.id)));
  $$(".list").forEach(list=>{
    list.addEventListener("dragover",e=>{e.preventDefault();list.style.outline="2px dashed var(--brand)";});
    list.addEventListener("dragleave",()=>list.style.outline="none");
    list.addEventListener("drop",async e=>{e.preventDefault();list.style.outline="none";const id=e.dataTransfer.getData("text/plain");const stage=list.dataset.drop;try{await updateDoc(doc(db,"leads",id),{stage,updatedAt:serverTimestamp(),managerId:currentUser?.uid||null});}catch(err){alert("Не удалось переместить: "+(err.message||err));}});
  });
}
function redrawDeals(deals){
  renderColumns(); $$(".od-col .count").forEach(el=>el.textContent="0");
  const dealList=$("#dealList"); dealList.innerHTML="";
  deals.forEach(d=>{
    const list=document.querySelector(`.od-col[data-stage="${d.stage||'lead'}"] .list`)||document.querySelector(`.od-col[data-stage="lead"] .list`);
    const card=renderCard(d); list.appendChild(card); const cnt=list.closest(".od-col").querySelector(".count"); cnt.textContent=(+cnt.textContent+1).toString();
    const row=document.createElement('div'); row.className='row'; row.innerHTML=`<div><b>${d.client||'Без имени'}</b> · <span class="badge">${d.stage}</span> · <a href="${waHref(d.phone,d.client)}" target="_blank" rel="noopener">${d.phone||''}</a></div><div>${d.budget?money(d.budget):''}</div>`; dealList.appendChild(row);
  });
  enableDnD();
}

addDealBtn?.addEventListener("click",()=>dealDialog.showModal());
dlgSave?.addEventListener("click",async e=>{
  e.preventDefault();
  const data={client:$("#dlgClient").value.trim(),phone:$("#dlgPhone").value.trim(),budget:Number($("#dlgBudget").value.replace(/\s|₸/g,""))||0,source:$("#dlgSource").value,stage:"lead",createdAt:serverTimestamp(),updatedAt:serverTimestamp(),managerId:currentUser?.uid||null};
  if(!data.client){$("#dlgClient").focus();return;}
  try{await addDoc(collection(db,"leads"),data);dealDialog.close();}catch(err){alert("Ошибка сохранения: "+(err.message||err));}
});

// Clients (list + settings edit)
let _clients=[]; const settingsClientList=$("#settingsClientList");
function renderClientsList(target,list){target.innerHTML="";list.forEach(c=>{const row=document.createElement('div');row.className='row';row.innerHTML=`<div><b>${c.name||'—'}</b> · <a href="${waHref(c.phone,c.name)}" target="_blank" rel="noopener">${c.phone||''}</a> · <span class="badge">${c.source||''}</span></div><button class="od-edit" data-edit="${c.id}">Изменить</button>`;target.appendChild(row);});}
function subscribeClients(){const q=query(collection(db,'clients'),orderBy('createdAt','desc')); onSnapshot(q,snap=>{_clients=snap.docs.map(d=>({id:d.id,...d.data()}));renderClientsList($("#clientList"),_clients);renderClientsList(settingsClientList,_clients);});}
$("#clientSearch").addEventListener('input',e=>{const q=(e.target.value||'').toLowerCase();const f=_clients.filter(c=>(c.name||'').toLowerCase().includes(q)||(c.phone||'').toLowerCase().includes(q));renderClientsList($("#clientList"),f);});
$("#settingsClientSearch").addEventListener('input',e=>{const q=(e.target.value||'').toLowerCase();const f=_clients.filter(c=>(c.name||'').toLowerCase().includes(q)||(c.phone||'').toLowerCase().includes(q));renderClientsList(settingsClientList,f);});
const clDialog=$("#clientDialog");
settingsClientList.addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(!b)return;const id=b.dataset.edit;const c=_clients.find(x=>x.id===id);if(!c)return;$("#clId").value=c.id;$("#clName").value=c.name||'';$("#clPhone").value=c.phone||'';$("#clSource").value=c.source||'Instagram';clDialog.showModal();});
$("#clSave").addEventListener('click',async e=>{e.preventDefault();const id=$("#clId").value;try{await updateDoc(doc(db,'clients',id),{name:$("#clName").value.trim(),phone:$("#clPhone").value.trim(),source:$("#clSource").value,updatedAt:serverTimestamp()});clDialog.close();}catch(err){alert('Не удалось сохранить: '+(err.message||err));}});

// Reports
const isToday=ts=>ts&&ts.toDate&&(()=>{const d=ts.toDate(),t=new Date();return d.getFullYear()===t.getFullYear()&&d.getMonth()===t.getMonth()&&d.getDate()===t.getDate()})();
function renderReports(deals){
  const todayDone=deals.filter(d=>d.stage==='install'&&isToday(d.updatedAt));
  const cnt=todayDone.length, sum=todayDone.reduce((a,b)=>a+(Number(b.budget)||0),0);
  $("#r-today-count").textContent=String(cnt); $("#r-today-sum").textContent=money(sum); $("#r-today-avg").textContent=cnt?money(Math.round(sum/cnt)):'0 ₸';
  const bySrc={}; deals.forEach(d=>{const s=d.source||'—'; bySrc[s]=bySrc[s]||{total:0,won:0}; bySrc[s].total++; if(d.stage==='install') bySrc[s].won++;});
  const wrap=$("#r-sources"); wrap.innerHTML=""; Object.entries(bySrc).sort((a,b)=>b[1].total-a[1].total).forEach(([src,v])=>{const conv=v.total?Math.round(v.won/v.total*100):0; const row=document.createElement('div'); row.className='q-row'; row.innerHTML=`<div>${src}</div><div class="q-bg"><div class="q-bar" style="width:${conv}%;"></div></div><div>${v.total} лид.</div><div>${conv}%</div>`; wrap.appendChild(row);});
}

// SW
if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js');}
