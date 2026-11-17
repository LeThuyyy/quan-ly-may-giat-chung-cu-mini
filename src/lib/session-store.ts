import { randomBytes } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'laundry_session';

export interface JavaSession {
  javaCookie: string;
  csrfHeaderName?: string;
  csrfToken?: string;
  updatedAt: number;
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

const globalForStore = globalThis as typeof globalThis & {
  __laundrySessionStore?: Map<string, JavaSession>;
};

const store = globalForStore.__laundrySessionStore ?? new Map<string, JavaSession>();
if (!globalForStore.__laundrySessionStore) {
  globalForStore.__laundrySessionStore = store;
}

function purgeExpired(): void {
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (now - entry.updatedAt > SESSION_TTL_MS) {
      store.delete(id);
    }
  }
}

export function createOpaqueSession(data: Omit<JavaSession, 'updatedAt'>): string {
  purgeExpired();
  const id = randomBytes(32).toString('hex');
  store.set(id, { ...data, updatedAt: Date.now() });
  return id;
}

export function getOpaqueSession(id: string | undefined | null): JavaSession | null {
  if (!id || !/^[0-9a-f]{64}$/.test(id)) return null;
  const entry = store.get(id);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > SESSION_TTL_MS) {
    store.delete(id);
    return null;
  }
  return entry;
}

export function updateOpaqueSession(id: string, patch: Partial<Omit<JavaSession, 'updatedAt'>>): void {
  const existing = getOpaqueSession(id);
  if (!existing) return;
  store.set(id, {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  });
}

export function deleteOpaqueSession(id: string | undefined | null): void {
  if (!id) return;
  store.delete(id);
}

export function buildSessionCookie(value: string, maxAgeSeconds: number) {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: maxAgeSeconds,
  };
}
