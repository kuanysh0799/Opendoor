// app.js — авторизация + канбан-воронка (amo-style)
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, setPersistence, browserLocalPersistence, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, enableIndexedDbPersistence, addDoc, collection, serverTimestamp,
  query, orderBy, onSnapshot, updateDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---- Firebase init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch(()=>{});
enableIndexedDbPersistence(db).catch(()=>{});

const provider = new GoogleAuthProvider();

// ---- UI helpers
const $  = (s, e=document) => e.querySelector(s);
const $$ = (s, e=document) => [...e.querySelectorAll(s)];
const money = n => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'KZT',maximumFractionDigits:0}).format(n||0);

const loginBtn  = $("#loginBtn");
const logoutBtn = $("#logoutBtn");
const userChip  = $("#userChip");
const userName  = $("#userName");
const addDealBtn= $("#addDealBtn");
const dealDialog= $("#dealDialog");
const dlgSave   = $("#dlgSave");

const STAGES = [
  {id:"lead",        name:"Лид"},
  {id:"contact",     name:"Контакт"},
  {id:"consult",     name:"Консультация"},
  {id:"kp",          name:"КП / Накладная"},
  {id:"pay",         name:"Оплата"},
  {id:"delivery",    name:"Доставка"},
  {id:"install",     name:"Установка"},
];

// построить пустые колонки
const kanbanEl = $("#kanban");
function renderColumns(){
  kanbanEl.innerHTML = STAGES.map(s=>`
    <section class="od-col" data-stage="${s.id}">
      <header><span>${s.name}</span> <span class="count">0</span></header>
      <div class="list" data-drop="${s.id}"></div>
    </section>
  `).join("");
}
renderColumns();

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
    startRealtime(); // подписка на сделки
  }else{
    document.body.classList.remove("authed");
    userChip?.classList.add("hidden");
    loginBtn?.classList.remove("hidden");
    stopRealtime();
  }
});

// ---- Realtime сделки по этапам
const unsub = { all: null };
function startRealtime(){
  stopRealtime();
  const q = query(collection(db,"leads"), orderBy("createdAt","desc"));
  unsub.all = onSnapshot(q, snap=>{
    // очистка
    $$(".od-col .list").forEach(el=>el.innerHTML="");
    $$(".od-col .count").forEach(el=>el.textContent="0");
    // заполнение
    snap.forEach(docSnap=>{
      const d= docSnap.data(); d.id = docSnap.id;
      const card = renderCard(d);
      const list = document.querySelector(`.od-col[data-stage="${d.stage||'lead'}"] .list`) || document.querySelector(`.od-col[data-stage="lead"] .list`);
      if(list){ list.appendChild(card); const cnt=list.closest(".od-col").querySelector(".count"); cnt.textContent= (+cnt.textContent+1).toString(); }
    });
    enableDnD();
  });
}
function stopRealtime(){ if(unsub.all){unsub.all();unsub.all=null;} }

function renderCard(d){
  const el = document.createElement("article");
  el.className="od-card"; el.draggable=true; el.dataset.id=d.id;
  el.innerHTML = `
    <div class="title">${d.client||"Без имени"}</div>
    <div class="meta">
      <span>${d.phone||""}</span>
      <span class="badge">${d.source||""}</span>
      <span class="badge${d.budget? ' badge--ok':''}">${d.budget? money(d.budget):"—"}</span>
    </div>
  `;
  return el;
}

// Drag & Drop
function enableDnD(){
  $$(".od-card").forEach(card=>{
    card.addEventListener("dragstart", e=>{
      e.dataTransfer.setData("text/plain", card.dataset.id);
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

// ---- Новая сделка
addDealBtn?.addEventListener("click", ()=>document.getElementById("dealDialog").showModal());
dlgSave?.addEventListener("click", async (e)=>{
  e.preventDefault();
  const data = {
    client: document.getElementById("dlgClient").value.trim(),
    phone:  document.getElementById("dlgPhone").value.trim(),
    budget: Number(document.getElementById("dlgBudget").value.replace(/\s|₸/g,""))||0,
    source: document.getElementById("dlgSource").value,
    stage: "lead",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    managerId: currentUser?.uid || null
  };
  if(!data.client){ document.getElementById("dlgClient").focus(); return; }
  try{
    await addDoc(collection(db,"leads"), data);
    document.getElementById("dealDialog").close();
  }catch(err){
    alert("Ошибка сохранения: "+(err.message||err));
  }
});

// SW
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js');
}
