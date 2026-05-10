import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
} from 'firebase/firestore'
import { ensureFirebaseAuth, firebaseDb } from './firebase'
import type { PetId } from './types'

export type MemberStatus = 'walking' | 'focus' | 'sleeping'

export interface TeamMember {
  uid: string
  displayName: string | null
  email: string | null
  petId: PetId
  status: MemberStatus
  x: number
  joinedAt: Timestamp | null
  lastSeenAt: Timestamp | null
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_CODE_LENGTH = 6

function generateCode(): string {
  let out = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  }
  return out
}

export function isValidRoomCode(s: string): boolean {
  return /^[A-Z0-9]{6}$/.test(s) && [...s].every((c) => ROOM_CODE_CHARS.includes(c))
}

export async function createRoom(): Promise<string> {
  const user = await ensureFirebaseAuth()
  const db = firebaseDb()
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateCode()
    const roomRef = doc(db, 'rooms', code)
    const created = await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef)
      if (snap.exists()) return false
      tx.set(roomRef, {
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      })
      return true
    })
    if (created) return code
  }
  throw new Error('failed to allocate room code after 6 attempts')
}

export async function roomExists(code: string): Promise<boolean> {
  const db = firebaseDb()
  const snap = await getDoc(doc(db, 'rooms', code))
  return snap.exists()
}

export async function joinRoom(
  code: string,
  petId: PetId,
  displayName: string | null,
): Promise<void> {
  const user = await ensureFirebaseAuth()
  const db = firebaseDb()
  const memberRef = doc(db, 'rooms', code, 'members', user.uid)
  await setDoc(memberRef, {
    uid: user.uid,
    displayName: displayName ?? user.displayName ?? null,
    email: user.email ?? null,
    petId,
    status: 'walking' as MemberStatus,
    x: Math.random(),
    joinedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  })
}

export async function leaveRoom(code: string): Promise<void> {
  const user = await ensureFirebaseAuth()
  const db = firebaseDb()
  const memberRef = doc(db, 'rooms', code, 'members', user.uid)
  await deleteDoc(memberRef)
}

export async function publishMemberState(
  code: string,
  patch: Partial<Pick<TeamMember, 'status' | 'x' | 'petId'>>,
): Promise<void> {
  const user = await ensureFirebaseAuth()
  const db = firebaseDb()
  const memberRef = doc(db, 'rooms', code, 'members', user.uid)
  await updateDoc(memberRef, {
    ...patch,
    lastSeenAt: serverTimestamp(),
  })
}

export function subscribeMembers(
  code: string,
  handler: (members: TeamMember[]) => void,
): Unsubscribe {
  const db = firebaseDb()
  const membersRef = collection(db, 'rooms', code, 'members')
  return onSnapshot(membersRef, (snap) => {
    const members: TeamMember[] = snap.docs.map((d) => {
      const data = d.data()
      return {
        uid: data.uid,
        displayName: data.displayName ?? null,
        email: data.email ?? null,
        petId: data.petId,
        status: (data.status ?? 'walking') as MemberStatus,
        x: typeof data.x === 'number' ? data.x : 0.5,
        joinedAt: data.joinedAt ?? null,
        lastSeenAt: data.lastSeenAt ?? null,
      }
    })
    handler(members)
  })
}

export function isStale(member: TeamMember, nowMs = Date.now()): boolean {
  if (!member.lastSeenAt) return false
  const lastMs = member.lastSeenAt.toMillis()
  return nowMs - lastMs > 30_000
}
