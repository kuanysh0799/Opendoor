// firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDFGSt9lWNg-SmTSuI4Af39XZBNjL9yTIY",
  authDomain: "opendoor-85e8d.firebaseapp.com",
  projectId: "opendoor-85e8d",
  storageBucket: "opendoor-85e8d.firebasestorage.app",
  messagingSenderId: "212873682532",
  appId: "1:212873682532:web:d4a9f89a596faffced4971",
  measurementId: "G-4D57SWBCF5"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);

// Экспорт для использования в других модулях
export const auth = getAuth(app);
export const db = getFirestore(app);
