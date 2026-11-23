import { Wallet } from "ethers";
import { adminAddress, universityName } from "../config";
import { DEPARTMENTS, TEACHER_TITLES, type Account, type Role } from "./roles";

const DIRECTORY_KEY = "veritas.directory.v1";
const SESSION_KEY = "veritas.session.v2";
const ITERATIONS = 150_000;

interface StoredAccount extends Account {
  salt: string;
  hash: string;
  iterations: number;
  createdBy: string;
}

export interface RegistrationInput {
  name: string;
  username: string;
  password: string;
  role: Role;
  title?: string;
  departments?: string[];
  field?: string;
  createdBy?: string;
}

export type AuthResult = { ok: true; account: Account } | { ok: false; error: string };

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,23}$/;

function publicAccount(stored: StoredAccount): Account {
  const { salt: _salt, hash: _hash, iterations: _iterations, createdBy: _createdBy, ...account } = stored;
  return account;
}

function readStore(): StoredAccount[] {
  try {
    const raw = window.localStorage.getItem(DIRECTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { accounts?: StoredAccount[] };
    return Array.isArray(parsed.accounts) ? parsed.accounts : [];
  } catch {
    return [];
  }
}

function writeStore(accounts: StoredAccount[]) {
  window.localStorage.setItem(DIRECTORY_KEY, JSON.stringify({ accounts }));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function derive(password: string, salt: string, iterations: number): Promise<string> {
  if (!window.crypto?.subtle) throw new Error("Web Crypto is unavailable in this browser context");
  const key = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await window.crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(salt), iterations },
    key,
    256
  );
  return toHex(new Uint8Array(bits));
}

function freshSalt(): string {
  return toHex(window.crypto.getRandomValues(new Uint8Array(16)));
}

function detailFor(input: { role: Role; title?: string; departments?: string[]; field?: string }): string {
  if (input.role === "admin") return `Academic Registry · ${universityName}`;
  if (input.role === "teacher") return `${input.title} · ${(input.departments ?? []).join(", ")}`;
  return input.field ?? "Student";
}

export function loadAccounts(): Account[] {
  const order: Record<Role, number> = { admin: 0, teacher: 1, student: 2 };
  return readStore()
    .map(publicAccount)
    .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
}

export function loadSessionAccount(): Account | null {
  const accountId = window.localStorage.getItem(SESSION_KEY);
  if (!accountId) return null;
  const stored = readStore().find((account) => account.id === accountId);
  return stored ? publicAccount(stored) : null;
}

export function saveSession(accountId: string) {
  window.localStorage.setItem(SESSION_KEY, accountId);
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

export async function registerAccount(input: RegistrationInput): Promise<AuthResult> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const username = input.username.trim().toLowerCase();
  const accounts = readStore();

  if (name.length < 2) return { ok: false, error: "Enter the member's full name." };
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, error: "Usernames are 3–24 characters: letters, digits, dots, dashes or underscores." };
  }
  if (accounts.some((account) => account.username === username)) {
    return { ok: false, error: `The username “${username}” is already taken on this device.` };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "Choose a password with at least 8 characters." };
  }

  let title: string | undefined;
  let departments: string[] | undefined;
  let field: string | undefined;

  if (input.role === "teacher") {
    departments = (input.departments ?? []).filter((department) => DEPARTMENTS.includes(department));
    if (departments.length === 0) return { ok: false, error: "Select at least one department to teach." };
    title = TEACHER_TITLES.includes(input.title ?? "") ? input.title : TEACHER_TITLES[2];
  }

  if (input.role === "student") {
    field = DEPARTMENTS.includes(input.field ?? "") ? input.field : DEPARTMENTS[0];
  }

  const salt = freshSalt();
  const hash = await derive(input.password, salt, ITERATIONS);

  const stored: StoredAccount = {
    id: window.crypto.randomUUID(),
    name,
    username,
    role: input.role,
    address: input.role === "admin" ? adminAddress : Wallet.createRandom().address,
    detail: detailFor({ role: input.role, title, departments, field }),
    title,
    departments,
    field,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? "self",
    salt,
    hash,
    iterations: ITERATIONS
  };

  writeStore([...accounts, stored]);
  return { ok: true, account: publicAccount(stored) };
}

export async function signIn(username: string, password: string): Promise<AuthResult> {
  const normalized = username.trim().toLowerCase();
  const stored = readStore().find((account) => account.username === normalized);
  if (!stored) return { ok: false, error: "No account on this device uses that username." };

  const candidate = await derive(password, stored.salt, stored.iterations);
  if (candidate !== stored.hash) return { ok: false, error: "That password does not match this account." };

  return { ok: true, account: publicAccount(stored) };
}
