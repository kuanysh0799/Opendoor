// app.js — logic + auth
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Helpers
const $ = (s, e=document)=> e.querySelector(s);
const $$ = (s, e=document)=> e.querySelectorAll(s);

// Tabs
$$('.tab').forEach(b=> b.addEventListener('click', ()=>{
  $$('.tab').forEach(x=>x.classList.toggle('active', x===b));
  const t = b.dataset.tab;
  $$('.tabpane').forEach(p=> p.classList.toggle('active', p.id===t));
}));

// Theme
$('#themeBtn').addEventListener('click', ()=> document.body.classList.toggle('light'));

// Install PWA prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt=e; $('#installBtn').style.display='inline-block'; });
$('#installBtn').addEventListener('click', async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt=null; });

// Auth
$('#loginBtn').addEventListener('click', async ()=>{
  try{
    const res = await signInWithPopup(auth, provider);
    const u = res.user;
    $('#userInfo').innerHTML = `Добро пожаловать, <b>${u.displayName||u.email}</b>`;
    $('#authBox').style.display='none';
  }catch(e){ alert('Ошибка входа: '+e.message); }
});

$('#logoutBtn')?.addEventListener('click', ()=> signOut(auth));

onAuthStateChanged(auth, u=>{
  if(u){ $('#authBox').style.display='none'; $('#userInfo').textContent = `Добро пожаловать, ${u.displayName||u.email}`;}
  else { $('#authBox').style.display='block'; }
});

// New deal buttons
const createDeal = async ()=>{
  const u = auth.currentUser;
  if(!u){ alert('Сначала войдите'); return; }
  try{
    await addDoc(collection(db,'deals'), {
      customer:{name:'Клиент', phone:''},
      items:[], totals:{amount:0,currency:'KZT'},
      payment:{status:'pending', method:'', approved:false},
      delivery:{date:'', time:'', status:'scheduled'},
      warehouse:{reserved:false,reservedBy:''},
      stage:'Лид', managerId:u.uid, createdAt:new Date().toISOString()
    });
    alert('Сделка создана');
  }catch(e){ alert('Не удалось создать сделку: '+e.message); }
};
$('#newDealBtn').addEventListener('click', createDeal);
$('#newDealBtn2').addEventListener('click', createDeal);

// FAB
$('#fab').addEventListener('click', createDeal);
