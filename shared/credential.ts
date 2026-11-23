import { ethers } from "ethers";
import type { DegreeCredential } from "./types";

export const CREDENTIAL_DOMAIN = { name: "AcademicCredential", version: "1" } as const;

export const CREDENTIAL_TYPES = {
  DegreeCredential: [
    { name: "issuer", type: "address" },
    { name: "studentDid", type: "string" },
    { name: "studentName", type: "string" },
    { name: "degreeType", type: "string" },
    { name: "fieldOfStudy", type: "string" },
    { name: "graduationYear", type: "uint16" },
    { name: "credentialId", type: "string" }
  ]
} as const;

export const ATTESTATION_TYPES = {
  BatchAttestation: [
    { name: "merkleRoot", type: "bytes32" },
    { name: "credentialCount", type: "uint32" },
    { name: "degreeType", type: "string" },
    { name: "graduationYear", type: "uint16" }
  ]
} as const;

export interface BatchAttestation {
  merkleRoot: string;
  credentialCount: number;
  degreeType: string;
  graduationYear: number;
}

/// The leaf committed inside the Merkle tree: an EIP-712 hash of every degree field.
export function credentialLeaf(credential: DegreeCredential): string {
  return ethers.TypedDataEncoder.hash(CREDENTIAL_DOMAIN, CREDENTIAL_TYPES, credential);
}

export function attestationDomain(chainId: number, verifyingContract: string): ethers.TypedDataDomain {
  return { name: "VeritasCredentialRegistry", version: "1", chainId, verifyingContract };
}

export async function signBatchAttestation(
  signer: ethers.Signer,
  chainId: number,
  verifyingContract: string,
  attestation: BatchAttestation
): Promise<string> {
  return signer.signTypedData(
    attestationDomain(chainId, verifyingContract),
    ATTESTATION_TYPES,
    attestation
  );
}

export function recoverAttestationSigner(
  chainId: number,
  verifyingContract: string,
  attestation: BatchAttestation,
  signature: string
): string {
  return ethers.verifyTypedData(
    attestationDomain(chainId, verifyingContract),
    ATTESTATION_TYPES,
    attestation,
    signature
  );
}

export function didForAddress(address: string): string {
  return `did:ethr:${address}`;
}

export function addressFromDid(did: string): string | null {
  const match = /^did:ethr:(0x[0-9a-fA-F]{40})$/.exec(did.trim());
  return match ? match[1] : null;
}
