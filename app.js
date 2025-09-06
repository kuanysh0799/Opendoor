import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

// Init Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Login
const loginBtn = document.getElementById("loginBtn");
loginBtn.addEventListener("click", async () => {
  if (auth.currentUser) {
    await signOut(auth);
    loginBtn.textContent = "Войти";
    document.getElementById("content").innerHTML = "<p>Вы вышли.</p>";
  } else {
    try {
      const result = await signInWithPopup(auth, provider);
      loginBtn.textContent = "Выйти";
      document.getElementById("content").innerHTML = `<p>Добро пожаловать, ${result.user.displayName}</p>`;
    } catch (e) {
      console.error("Ошибка входа:", e);
    }
  }
});

// FAB create deal
document.getElementById("fab").addEventListener("click", async () => {
  if (!auth.currentUser) {
    alert("Сначала войдите через Google.");
    return;
  }
  try {
    await addDoc(collection(db, "deals"), {
      name: "Новая сделка",
      created: new Date(),
      user: auth.currentUser.uid
    });
    alert("Сделка создана!");
  } catch (e) {
    console.error("Ошибка при создании сделки:", e);
  }
});

// Tabs
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("content").innerHTML = `<h2>${tab.textContent}</h2><p>Содержимое вкладки появится позже.</p>`;
  });
});

// Theme toggle
document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
});