import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import type { AnyDoc, CollectionName, DataSet } from '../types'
import { COLLECTIONS, emptyDataSet } from '../types'
import type { DataAdapter } from './adapter'

export function firebaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID)
}

let app: FirebaseApp | null = null
let db: Firestore | null = null

function ensureFirebase(): Firestore {
  if (!db) {
    app = initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    })
    // Persistência offline: escreve local e sincroniza quando houver rede.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  }
  return db
}

export class FirebaseAdapter implements DataAdapter {
  private data: DataSet = emptyDataSet()
  private onChange: ((data: DataSet) => void) | null = null
  private unsubs: Unsubscribe[] = []
  private loaded = new Set<CollectionName>()

  constructor(private spaceCode: string) {}

  private path(name: CollectionName) {
    return collection(ensureFirebase(), 'spaces', this.spaceCode, name)
  }

  async start(onChange: (data: DataSet) => void): Promise<void> {
    this.onChange = onChange
    const firestore = ensureFirebase()
    await signInAnonymously(getAuth(app!))

    await new Promise<void>((resolve) => {
      let pending = COLLECTIONS.length
      for (const name of COLLECTIONS) {
        const unsub = onSnapshot(collection(firestore, 'spaces', this.spaceCode, name), (snap) => {
          this.data = {
            ...this.data,
            [name]: snap.docs.map((d) => d.data() as AnyDoc),
          }
          if (!this.loaded.has(name)) {
            this.loaded.add(name)
            pending--
            if (pending === 0) resolve()
          }
          this.onChange?.({ ...this.data })
        })
        this.unsubs.push(unsub)
      }
    })
  }

  stop(): void {
    this.unsubs.forEach((u) => u())
    this.unsubs = []
    this.onChange = null
  }

  async put(collectionName: CollectionName, docData: AnyDoc): Promise<void> {
    await setDoc(doc(this.path(collectionName), docData.id), stripUndefined(docData))
  }

  async putMany(collectionName: CollectionName, docs: AnyDoc[]): Promise<void> {
    // Firestore limita batches a 500 operações
    for (let i = 0; i < docs.length; i += 450) {
      const batch = writeBatch(ensureFirebase())
      for (const d of docs.slice(i, i + 450)) {
        batch.set(doc(this.path(collectionName), d.id), stripUndefined(d))
      }
      await batch.commit()
    }
  }

  async remove(collectionName: CollectionName, id: string): Promise<void> {
    await deleteDoc(doc(this.path(collectionName), id))
  }

  snapshot(): DataSet {
    return this.data
  }

  isEmpty(): boolean {
    return COLLECTIONS.every((c) => this.data[c].length === 0)
  }
}

// Firestore rejeita valores undefined
function stripUndefined<T extends object>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T
}

// Resgata um código de acesso premium (ver VITE_PREMIUM_CODES): confirma que
// o código está na lista configurada e regista o seu uso no Firestore de
// forma atómica — a doc só pode ser criada uma vez (ver firestore.rules),
// por isso a 2ª tentativa com o mesmo código falha com permission-denied.
// O getDoc prévio é só para dar um erro claro — a segurança real (impedir
// reutilização em corrida) está sempre garantida pelo setDoc + regras.
export async function redeemPremiumCode(code: string, spaceCode: string): Promise<void> {
  const trimmed = code.trim().toLowerCase()
  const valid = String(import.meta.env.VITE_PREMIUM_CODES ?? '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
  if (!valid.includes(trimmed)) throw new Error('Código de acesso inválido.')
  const firestore = ensureFirebase()
  await signInAnonymously(getAuth(app!))
  const ref = doc(firestore, 'premiumCodeRedemptions', trimmed)
  let snap
  try {
    snap = await getDoc(ref)
  } catch {
    throw new Error(
      'Não foi possível ligar ao Firestore. Confirma que publicaste as regras de segurança atualizadas (firestore.rules) na consola Firebase.',
    )
  }
  if (snap.exists()) throw new Error('Este código já foi utilizado.')
  try {
    await setDoc(ref, { usedAt: new Date().toISOString(), spaceCode })
  } catch {
    throw new Error('Este código já foi utilizado.')
  }
}
