// app.js
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, onSnapshot, serverTimestamp, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Offline (игнор ошибки второй инициализации в Safari private)
enableIndexedDbPersistence(db).catch(()=>{});

const provider = new GoogleAuthProvider();

// UI
const $ = (s, e=document)=>e.querySelector(s);
const $all = (s, e=document)=>[...e.querySelectorAll(s)];

const pages = $all('.page');
$all('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  $all('.tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const id = btn.dataset.tab;
  pages.forEach(p=>p.classList.toggle('active', p.id===id));
}));

// Login / logout
$('#loginBtn').addEventListener('click', async ()=>{
  try{
    await signInWithPopup(auth, provider);
  }catch(e){
    alert('Вход не выполнен: '+ e.message);
  }
});
$('#logoutBtn').addEventListener('click', ()=>signOut(auth));

onAuthStateChanged(auth, user=>{
  if(user){
    $('#userChip').classList.remove('hidden');
    $('#logoutBtn').classList.remove('hidden');
    $('#loginBtn').classList.add('hidden');
    $('#userChip').textContent = user.displayName || user.email;
    bootData(); // загрузка данных
  }else{
    $('#userChip').classList.add('hidden');
    $('#logoutBtn').classList.add('hidden');
    $('#loginBtn').classList.remove('hidden');
    // очистка списков
    $('#clientsList').innerHTML = '';
    $('#dealsList').innerHTML = '';
    $('#pipelineBoard').innerHTML = '';
  }
});

// Воронка
const STAGES = ["Лид","Контакт","Консультация","КП/Накладная","Оплата","Доставка","Установка"];
function renderBoard(deals){
  const board = $('#pipelineBoard');
  board.innerHTML = '';
  STAGES.forEach(stage=>{
    const col = document.createElement('div');
    col.className='column';
    col.innerHTML = `<h3>${stage} <span class="badge">${deals.filter(d=>d.stage===stage).length}</span></h3><div class="cards"></div>`;
    const wrap = col.querySelector('.cards');
    deals.filter(d=>d.stage===stage).forEach(d=>{
      const li = document.createElement('div');
      li.className='card';
      li.innerHTML = `<div class="row"><b>${d.title||'Сделка'}</b><span>${d.amount? new Intl.NumberFormat('ru-RU').format(d.amount)+' ₸':''}</span></div>
                      <div class="row"><span>${d.clientName||''}</span><span>${d.source||''}</span></div>`;
      wrap.appendChild(li);
    });
    board.appendChild(col);
  });
}

// Добавить сделку
async function addDealQuick(){
  const title = prompt('Название сделки?');
  if(!title) return;
  const amount = Number(prompt('Сумма, ₸?')||0);
  const clientName = prompt('Клиент (имя)?') || '';
  const source = prompt('Источник (Instagram/WhatsApp/2ГИС/Рекомендации/Магазин)?') || '';
  await addDoc(collection(db,'deals'), {
    title, amount, clientName, source,
    stage: 'Лид',
    createdAt: serverTimestamp(),
    owner: auth.currentUser.uid
  });
}
$('#newDealBtn').addEventListener('click', addDealQuick);
$('#addDealFab').addEventListener('click', addDealQuick);

// Клиенты
$('#newClientBtn').addEventListener('click', async ()=>{
  const name = prompt('Имя клиента?'); if(!name) return;
  const phone = prompt('Телефон?') || '';
  const src = prompt('Источник (Instagram/WhatsApp/2ГИС/Рекомендации/Магазин)?') || '';
  await addDoc(collection(db,'clients'), {name, phone, source:src, createdAt: serverTimestamp(), owner: auth.currentUser.uid});
});

$('#clientSearch').addEventListener('input', e=> filterClients(e.target.value));

let _clientsCache = [];
function renderClients(list){
  const ul = $('#clientsList');
  ul.innerHTML = '';
  list.forEach(c=>{
    const li = document.createElement('li');
    li.innerHTML = `<b>${c.name||'Без имени'}</b> <span class="badge">${c.source||''}</span><br>
                    <span style="color:#9ca3af">${c.phone||''}</span>`;
    ul.appendChild(li);
  });
}
function filterClients(q){
  q = (q||'').toLowerCase().trim();
  if(!q) return renderClients(_clientsCache);
  const res = _clientsCache.filter(c=>(c.name||'').toLowerCase().includes(q) || (c.phone||'').toLowerCase().includes(q));
  renderClients(res);
}

// KPI
function renderKPI(deals){
  const total = deals.reduce((s,d)=>s+(Number(d.amount)||0),0);
  const won = deals.filter(d=>d.stage==='Установка').reduce((s,d)=>s+(Number(d.amount)||0),0);
  $('#kpi').innerHTML = `
    <div class="tile"><div>Сделок</div><h3>${deals.length}</h3></div>
    <div class="tile"><div>Сумма в работе</div><h3>${new Intl.NumberFormat('ru-RU').format(total)} ₸</h3></div>
    <div class="tile"><div>Выручка</div><h3>${new Intl.NumberFormat('ru-RU').format(won)} ₸</h3></div>`;
}

// Подписки на данные
function bootData(){
  onSnapshot(collection(db,'clients'), snap=>{
    _clientsCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
    filterClients($('#clientSearch').value);
  });
  onSnapshot(collection(db,'deals'), snap=>{
    const deals = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderBoard(deals);
    renderKPI(deals);
    // список
    const ul = $('#dealsList');
    ul.innerHTML = '';
    deals.forEach(d=>{
      const li = document.createElement('li');
      li.innerHTML = `<b>${d.title||'Сделка'}</b> — ${d.stage} <span class="badge">${d.source||''}</span><br>
                      <span style="color:#9ca3af">${d.clientName||''}</span> <span style="float:right">${d.amount? new Intl.NumberFormat('ru-RU').format(d.amount)+' ₸':''}</span>`;
      ul.appendChild(li);
    });
  });
}

// Install prompt (Android/desktop Chrome)
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  $('#installBtn').classList.remove('hidden');
});
$('#installBtn').addEventListener('click', async ()=>{
  if(!deferredPrompt){ alert('Для iPhone: Поделиться → На экран «Домой».'); return; }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
});

// SW
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js');
}
