// Seed ~50 fake players into the leaderboard.
//
// Uses the Firebase Web SDK with the same config as the app. Writes go to
// docs with uid prefix "fake-player-..." which your TEMP Firestore rule allows:
//   allow write: if uid.matches('fake-player-.*');
//
// Run from the project root:
//   node scripts/seedLeaderboard.js
//
// Remove fakes later with:
//   node scripts/seedLeaderboard.js --clear

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
} from "firebase/firestore";

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
const db = getFirestore(app);

// Same scoring formula as src/lib/firebase.js
function calcScore(wins, losses) {
  const total = wins + losses;
  if (total === 0) return 0;
  return ((wins - losses) * total) / (total + 1);
}

// 50 "almost real" nicknames
const NICKNAMES = [
  "crotigar12",
  "slanina1998",
  "ivoZD",
  "dr_johhny",
  "marko_st",
  "pero99",
  "zeljkoo",
  "luka_modric10",
  "ana_banana",
  "tomislavv",
  "kingbela",
  "stipe_split",
  "mateo1985",
  "vatreni4ever",
  "domagoj_os",
  "filip_ri",
  "nikolinaa",
  "bruno_zg",
  "darko_vk",
  "sandra87",
  "ivek_gradec",
  "majstor_za_belu",
  "antee",
  "gabo_dubrovnik",
  "robi_pula",
  "klaudija_",
  "zoki_bjelovar",
  "denis_si",
  "vladoo73",
  "hrvoje_ka",
  "barba_ante",
  "frane_zd",
  "josip_broz77",
  "mladen_cko",
  "petra_loves_cards",
  "drazen_p",
  "goran_va",
  "borna_kc",
  "sime_tilda",
  "kreso_medjimurje",
  "tonkica",
  "vinko_baranja",
  "miro_slavonac",
  "ozren88",
  "lovro_zg",
  "tena_os",
  "bozo_makarska",
  "dario_velika",
  "senad_bih",
  "ratko_lika",
];

// Build a believable distribution of wins/losses
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
  console.log(`Seeding ${NICKNAMES.length} fake players...`);
  let ok = 0;
  for (let i = 0; i < NICKNAMES.length; i++) {
    const nickname = NICKNAMES[i];
    const uid = `fake-player-${String(i).padStart(3, "0")}`;

    // Vary skill: some grinders, some casuals, a few sharks
    const games = randInt(8, 220);
    const winRate = Math.min(0.85, Math.max(0.2, 0.5 + (Math.random() - 0.5) * 0.6));
    const wins = Math.round(games * winRate);
    const losses = games - wins;
    const abandoned = randInt(0, Math.max(1, Math.round(games * 0.05)));

    try {
      await setDoc(doc(db, "belot-players", uid), {
        nickname,
        email: `${uid}@fake.local`,
        wins,
        losses,
        abandoned,
        score: calcScore(wins, losses),
        createdAt: Date.now() - randInt(0, 365) * 86400000,
        fake: true,
      });
      ok++;
      process.stdout.write(".");
    } catch (e) {
      console.error(`\nFailed ${uid} (${nickname}):`, e.message);
    }
  }
  console.log(`\nDone. Seeded ${ok}/${NICKNAMES.length} players.`);
}

async function clear() {
  console.log("Clearing fake players...");
  const snap = await getDocs(collection(db, "belot-players"));
  let removed = 0;
  for (const d of snap.docs) {
    if (d.id.startsWith("fake-player-")) {
      try {
        await deleteDoc(doc(db, "belot-players", d.id));
        removed++;
        process.stdout.write(".");
      } catch (e) {
        console.error(`\nFailed to delete ${d.id}:`, e.message);
      }
    }
  }
  console.log(`\nDone. Removed ${removed} fake players.`);
}

const mode = process.argv.includes("--clear") ? clear : seed;
mode()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
