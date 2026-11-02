// The only file that talks to Firebase. Bundled to app/backend.js by `npm run build`.
import { initializeApp } from "firebase/app";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager, memoryLocalCache,
  connectFirestoreEmulator, collection, doc, onSnapshot, setDoc, deleteDoc, getDoc as fsGetDoc,
} from "firebase/firestore";
import {
  initializeAuth, connectAuthEmulator, indexedDBLocalPersistence, browserLocalPersistence,
  inMemoryPersistence, signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged,
} from "firebase/auth";

const NGUOI_KEY = "so-cong-dau.v1.nguoi";
let appCount = 0;

export function signInKind(code) {
  if (code === "auth/invalid-credential" || code === "auth/wrong-password") return "wrong-pin";
  if (code === "auth/network-request-failed") return "offline";
  if (code === "auth/too-many-requests") return "too-many-tries";
  return "other";
}

export function errorKind(e) {
  const code = e && e.code;
  if (code === "permission-denied") return "refused";
  if (code === "unavailable" || code === "auth/network-request-failed") return "offline";
  return "other";
}

// options.emulator: connect to the local emulators.
// options.readDoc: replaces the Firestore read in tests, to simulate an unreachable server.
// options.persistent: IndexedDB cache and persistent sign-in. Defaults to true only when
// IndexedDB exists, so Node tests fall back to memory while real browsers get persistence.
export function createBackend(config, options = {}) {
  const persistent = options.persistent !== undefined ? options.persistent : typeof indexedDB !== "undefined";
  const getDoc = options.readDoc || fsGetDoc;
  const app = initializeApp(config, "so-" + appCount++);
  const db = initializeFirestore(app, {
    localCache: persistent ? persistentLocalCache({ tabManager: persistentSingleTabManager() }) : memoryLocalCache(),
  });
  const auth = initializeAuth(app, {
    persistence: persistent ? [indexedDBLocalPersistence, browserLocalPersistence] : inMemoryPersistence,
  });
  if (options.emulator) {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }

  const store = {
    collection(name) {
      return {
        onSnapshot(onData, onError) {
          return onSnapshot(collection(db, name), { includeMetadataChanges: true }, onData, onError);
        },
        doc(id) {
          const ref = doc(db, name, id);
          return { set: (data) => setDoc(ref, data), delete: () => deleteDoc(ref) };
        },
      };
    },
  };

  const readCache = () => { try { return JSON.parse(localStorage.getItem(NGUOI_KEY)); } catch (e) { return null; } };
  const writeCache = (v) => {
    try { if (v) localStorage.setItem(NGUOI_KEY, JSON.stringify(v)); else localStorage.removeItem(NGUOI_KEY); } catch (e) { /* no storage */ }
  };
  const cached = (uid) => {
    const c = readCache();
    return c && c.uid === uid ? { name: c.name, role: c.role } : null;
  };

  return {
    store,
    signIn(email, pin) {
      return signInWithEmailAndPassword(auth, email, pin).then(
        () => undefined,
        (e) => { throw { code: signInKind(e && e.code) }; },
      );
    },
    signOut: () => fbSignOut(auth),
    onUser: (cb) => onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid } : null)),
    // Resolves null ONLY when the server confirms there is no row.
    // Row unreachable and nothing cached: rejects with { code: "offline" }.
    async profile(uid) {
      const unreachable = () => cached(uid) || Promise.reject({ code: "offline" });
      let snap;
      try { snap = await getDoc(doc(db, "people", uid)); } catch (e) {
        // Rules only let a person with a row read people/, so for a login without a row the server answers permission-denied: that is a confirmed "no row"
        if (e && e.code === "permission-denied") { writeCache(null); return null; }
        return unreachable();
      }
      if (snap.exists()) {
        const { name, role } = snap.data();
        writeCache({ uid, name, role });
        return { name, role };
      }
      if (snap.metadata.fromCache) return unreachable();
      writeCache(null);
      return null;
    },
    errorKind,
  };
}

if (typeof window !== "undefined" && window.SO_FIREBASE_CONFIG) {
  window.soBackend = createBackend(window.SO_FIREBASE_CONFIG, { emulator: window.SO_EMULATOR === true });
}
