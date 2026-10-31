// Firebase через CDN (без сборщика), совместимо с GitHub Pages
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, setDoc, updateDoc, addDoc, deleteDoc,
  onSnapshot, arrayUnion, arrayRemove, deleteField, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBHMqmWMHR7ecNaOisGoB8Q0-Df_L8bSRs",
  authDomain: "family-b7a59.firebaseapp.com",
  projectId: "family-b7a59",
  storageBucket: "family-b7a59.firebasestorage.app",
  messagingSenderId: "686387811659",
  appId: "1:686387811659:web:9a96c031e1d4cb5993c4ce"
};

const app = initializeApp(firebaseConfig);
export const configured = true;
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
export {
  signInWithPopup, onAuthStateChanged,
  doc, getDoc, collection, setDoc, updateDoc, addDoc, deleteDoc,
  onSnapshot, arrayUnion, arrayRemove, deleteField, increment
};
