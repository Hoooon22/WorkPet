import { FirebaseApp, initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth,
  Auth,
  GoogleAuthProvider,
  signInWithCredential,
  User,
} from 'firebase/auth'
import { Firestore, getFirestore } from 'firebase/firestore'
import {
  FIREBASE_CONFIG,
  FIRESTORE_DATABASE_ID,
  isFirebaseConfigured,
} from './firebaseConfig'
import { getValue, KEYS } from './storage'
import { signIn } from './auth'

let appInstance: FirebaseApp | null = null

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase not configured — check .env.local (VITE_FIREBASE_*)')
  }
  if (appInstance) return appInstance
  appInstance = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG)
  return appInstance
}

export function firebaseAuth(): Auth {
  return getAuth(getFirebaseApp())
}

export function firebaseDb(): Firestore {
  const app = getFirebaseApp()
  return FIRESTORE_DATABASE_ID === '(default)'
    ? getFirestore(app)
    : getFirestore(app, FIRESTORE_DATABASE_ID)
}

export async function ensureFirebaseAuth(): Promise<User> {
  const auth = firebaseAuth()
  if (auth.currentUser) return auth.currentUser

  let idToken = await getValue<string>(KEYS.AUTH_ID_TOKEN)
  if (!idToken) {
    await signIn()
    idToken = await getValue<string>(KEYS.AUTH_ID_TOKEN)
  }
  if (!idToken) {
    throw new Error('Google id_token unavailable after sign-in')
  }

  const credential = GoogleAuthProvider.credential(idToken)
  const result = await signInWithCredential(auth, credential)
  return result.user
}
