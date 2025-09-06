// app.js — авторизация + базовая логика вкладок
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { 
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// UI elements (проверяем наличие — код безопасен для любой верстки)
const loginBtn = document.getElementById('loginBtn') || document.querySelector('[data-login]');
const logoutBtn = document.getElementById('logoutBtn') || document.querySelector('[data-logout]');
const userNameEl = document.getElementById('userName');
const avatarEl = document.getElementById('userAvatar');

// Login handler
async function doLogin() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    // Если popup заблокирован — редирект
    await signInWithRedirect(auth, provider);
  }
}

function doLogout() {
  signOut(auth);
}

// Bind
if (loginBtn) loginBtn.addEventListener('click', doLogin);
if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

// Auth state
onAuthStateChanged(auth, (user) => {
  if (user) {
    if (userNameEl) userNameEl.textContent = user.displayName || user.email || 'Пользователь';
    if (loginBtn) {
      loginBtn.textContent = 'В аккаунте';
      loginBtn.disabled = true;
    }
    if (avatarEl && user.photoURL) avatarEl.src = user.photoURL;
    document.documentElement.classList.add('authed');
  } else {
    if (userNameEl) userNameEl.textContent = '';
    if (loginBtn) {
      loginBtn.textContent = 'Войти через Google';
      loginBtn.disabled = false;
    }
    document.documentElement.classList.remove('authed');
  }
});

// Регистрация SW (важно для подпути /Opendoor/)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swPath = new URL('sw.js', window.location.href).toString();
    navigator.serviceWorker.register(swPath);
  });
}

// Примитивный роутинг вкладок (если у вас соответствующая верстка)
document.querySelectorAll('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = btn.getAttribute('data-tab');
    document.querySelectorAll('[data-view]').forEach(v => v.hidden = v.getAttribute('data-view') !== t);
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b===btn));
    history.replaceState({}, '', `#${t}`);
  });
});

// Открываем таб из hash
(function () {
  const h = location.hash.replace('#', '');
  const targetBtn = document.querySelector(`[data-tab="${h}"]`);
  if (targetBtn) targetBtn.click();
})();
