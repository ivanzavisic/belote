import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  runTransaction,
} from "firebase/firestore";

function calcScore(wins, losses) {
  const total = wins + losses;
  if (total === 0) return 0;
  return ((wins - losses) * total) / (total + 1);
}

const firebaseConfig = {
  apiKey: "AIzaSyCCW_83xF14llPTOTIubMUsLMwYjs71VGM",
  authDomain: "hexgame-719b9.firebaseapp.com",
  projectId: "hexgame-719b9",
  storageBucket: "hexgame-719b9.firebasestorage.app",
  messagingSenderId: "228064049346",
  appId: "1:228064049346:web:19b90261c08e9b9326e35b",
  measurementId: "G-NVHSV137FB",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// --- Auth Functions ---

export async function registerWithEmail(email, password, nickname) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "belot-players", cred.user.uid), {
    nickname,
    email,
    wins: 0,
    losses: 0,
    abandoned: 0,
    score: 0,
    createdAt: Date.now(),
  });
  return cred.user;
}

export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function ensurePlayerDoc(user) {
  const playerDoc = await getDoc(doc(db, "belot-players", user.uid));
  if (!playerDoc.exists()) {
    const nickname = user.displayName || user.email?.split("@")[0] || "Igrač";
    await setDoc(doc(db, "belot-players", user.uid), {
      nickname: nickname.slice(0, 16),
      email: user.email || "",
      wins: 0,
      losses: 0,
      abandoned: 0,
      score: 0,
      createdAt: Date.now(),
    });
  }
}

export async function loginWithGoogle() {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensurePlayerDoc(cred.user);
    return cred.user;
  } catch (err) {
    // If popup errored due to COOP but auth actually succeeded, recover
    const currentUser = auth.currentUser;
    if (currentUser) {
      await ensurePlayerDoc(currentUser);
      return currentUser;
    }
    throw err;
  }
}

export async function logout() {
  await signOut(auth);
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// --- Player Data ---

export async function getPlayerData(uid) {
  const snap = await getDoc(doc(db, "belot-players", uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function updatePlayerNickname(uid, nickname) {
  await updateDoc(doc(db, "belot-players", uid), { nickname });
}

export async function recordWin(uid) {
  const ref = doc(db, "belot-players", uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const d = snap.data();
    const newWins = (d.wins || 0) + 1;
    tx.update(ref, { wins: newWins, score: calcScore(newWins, d.losses || 0) });
  });
}

export async function recordLoss(uid) {
  const ref = doc(db, "belot-players", uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const d = snap.data();
    const newLosses = (d.losses || 0) + 1;
    tx.update(ref, {
      losses: newLosses,
      score: calcScore(d.wins || 0, newLosses),
    });
  });
}

export async function recordAbandon(uid) {
  await updateDoc(doc(db, "belot-players", uid), { abandoned: increment(1) });
}

// --- Leaderboard ---

export async function getLeaderboard(count = 20) {
  const q = query(
    collection(db, "belot-players"),
    orderBy("score", "desc"),
    limit(count),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d, i) => ({ rank: i + 1, uid: d.id, ...d.data() }));
}

export { auth, db };
