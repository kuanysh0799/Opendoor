// app.js — только Firebase и логин, без изменений твоего UI

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, setPersistence, browserLocalPersistence, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// твой файл с конфигом
import { firebaseConfig } from "./firebase-config.js";

// --- Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// сохраняем сессию между перезагрузками
await setPersistence(auth, browserLocalPersistence);

// провайдер Google
const provider = new GoogleAuthProvider();

// детектор режима установленного PWA (на iPhone тоже работает)
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;

// элементы твоего интерфейса (оставь кнопки/лейблы с этими id в HTML)
const $ = (s, e=document) => e.querySelector(s);
const loginBtn  = $("#loginBtn");      // «Войти через Google»
const logoutBtn = $("#logoutBtn");     // «Выйти» (если есть)
const userChip  = $("#userChip");      // бейдж с именем (если есть)
const userName  = $("#userName");      // подпись имени (если есть)

// нажатие «Войти»
loginBtn?.addEventListener("click", async () => {
  try {
    if (isStandalone) {
      await signInWithRedirect(auth, provider);   // в PWA надёжнее redirect
    } else {
      await signInWithPopup(auth, provider);      // в браузере предпочтительней popup
    }
  } catch (e) {
    // если popup заблокирован — уходим на redirect
    if (e.code === "auth/popup-blocked") {
      await signInWithRedirect(auth, provider);
    } else {
      alert("Ошибка входа: " + (e.message || e));
      console.error(e);
    }
  }
});

// обработка возврата после redirect
getRedirectResult(auth).catch(err => console.debug("Redirect result:", err?.message || err));

// изменение состояния авторизации
onAuthStateChanged(auth, (user) => {
  if (user) {
    // вошли: прячем кнопку «Войти», показываем имя, разблокируем разделы
    loginBtn?.classList.add("hidden");
    userChip?.classList.remove("hidden");
    if (userName) userName.textContent = user.displayName || user.email;
    document.body.classList.add("authed");
    console.log("Signed in:", user.uid, user.email);
  } else {
    // вышли: показываем «Войти»
    loginBtn?.classList.remove("hidden");
    userChip?.classList.add("hidden");
    document.body.classList.remove("authed");
  }
});

// «Выйти»
logoutBtn?.addEventListener("click", () => signOut(auth));

// экспортируй db при необходимости
export { db, auth };
