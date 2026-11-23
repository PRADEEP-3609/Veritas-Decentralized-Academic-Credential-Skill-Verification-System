import { addressFromDid } from "@shared/credential";
import type { VerifiableCredential } from "@shared/types";

export type WalletMap = Record<string, VerifiableCredential[]>;

const PREFIX = "veritas.wallet.v1";

function storageKey(scope: string) {
  return `${PREFIX}:${scope.toLowerCase()}`;
}

export function loadWallet(scope: string): WalletMap {
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    return raw ? (JSON.parse(raw) as WalletMap) : {};
  } catch {
    return {};
  }
}

export function saveWallet(scope: string, wallet: WalletMap) {
  window.localStorage.setItem(storageKey(scope), JSON.stringify(wallet));
}

export function clearWallet(scope: string) {
  window.localStorage.removeItem(storageKey(scope));
}

export function withCredentials(wallet: WalletMap, credentials: VerifiableCredential[]): WalletMap {
  const next: WalletMap = { ...wallet };
  for (const vc of credentials) {
    const holder = addressFromDid(vc.credential.studentDid)?.toLowerCase();
    if (!holder) continue;
    const existing = next[holder] ?? [];
    next[holder] = [...existing.filter((item) => item.credential.credentialId !== vc.credential.credentialId), vc].sort(
      (a, b) => b.issuedAt - a.issuedAt
    );
  }
  return next;
}

export function totalCredentials(wallet: WalletMap): number {
  return Object.values(wallet).reduce((sum, list) => sum + list.length, 0);
}
