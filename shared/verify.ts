import { Contract, type Provider } from "ethers";
import { addressFromDid, credentialLeaf, recoverAttestationSigner } from "./credential";
import { verifyMerkleProof } from "./merkle";
import type { BatchRecord, VerifiableCredential } from "./types";

const CREDENTIAL_REGISTRY_ABI = [
  "function batch(uint256 batchId) view returns (tuple(address issuer, bytes32 merkleRoot, uint32 credentialCount, uint64 issuedAt, uint16 graduationYear, string degreeType))",
  "function verifyCredential(uint256 batchId, bytes32 leaf, bytes32[] proof) view returns (bool)"
];

const UNIVERSITY_REGISTRY_ABI = [
  "function isUniversity(address account) view returns (bool)",
  "function nameOf(address account) view returns (string)"
];

export interface VerificationDeps {
  provider: Provider;
  credentialRegistry: string;
  universityRegistry: string;
}

export interface VerificationStep {
  id: string;
  title: string;
  detail: string;
  ok: boolean;
  ms: number;
}

export interface VerificationReport {
  ok: boolean;
  steps: VerificationStep[];
  totalMs: number;
  issuerName?: string;
  batch?: BatchRecord & { id: number };
}

const clock = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const round = (value: number) => Math.round(value * 100) / 100;

function assert(condition: boolean, message: string, success: string): string {
  if (!condition) throw new Error(message);
  return success;
}

function isHex32(value: unknown): boolean {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export async function verifyPresentation(
  vc: VerifiableCredential,
  deps: VerificationDeps
): Promise<VerificationReport> {
  const startedAt = clock();
  const steps: VerificationStep[] = [];
  const credentialRegistry = new Contract(deps.credentialRegistry, CREDENTIAL_REGISTRY_ABI, deps.provider);
  const universityRegistry = new Contract(deps.universityRegistry, UNIVERSITY_REGISTRY_ABI, deps.provider);

  let issuerName: string | undefined;
  let batch: (BatchRecord & { id: number }) | undefined;

  const run = async (id: string, title: string, fn: () => Promise<string> | string) => {
    const started = clock();
    try {
      const detail = await fn();
      steps.push({ id, title, detail, ok: true, ms: round(clock() - started) });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      steps.push({ id, title, detail, ok: false, ms: round(clock() - started) });
    }
  };

  const credential = vc?.credential ?? ({} as VerifiableCredential["credential"]);

  await run("schema", "Credential structure", () =>
    assert(
      vc.version === "1.0" &&
        credential.studentName.trim().length > 0 &&
        credential.degreeType.trim().length > 0 &&
        credential.fieldOfStudy.trim().length > 0 &&
        credential.credentialId.trim().length > 0 &&
        Number.isInteger(credential.graduationYear) &&
        credential.graduationYear >= 1900 &&
        credential.graduationYear <= 2100 &&
        Number.isInteger(vc.batchId) &&
        vc.batchId > 0 &&
        isHex32(vc.leaf) &&
        isHex32(vc.merkleRoot) &&
        Array.isArray(vc.proof) &&
        vc.proof.every(isHex32),
      "Credential is malformed or missing required fields",
      `Schema v${vc.version} · ${vc.proof.length}-level proof · ${credential.graduationYear} cohort`
    )
  );

  await run("did", "Holder DID binding", () => {
    const bound = addressFromDid(credential.studentDid);
    return assert(
      bound !== null,
      "credentialSubject.id is not a valid did:ethr identifier",
      `did:ethr resolves to ${bound?.slice(0, 10)}…${bound?.slice(-6)}`
    );
  });

  await run("issuer", "Issuer authorization", async () => {
    const registered: boolean = await universityRegistry.isUniversity(credential.issuer);
    if (registered) issuerName = await universityRegistry.nameOf(credential.issuer);
    return assert(
      registered,
      `${credential.issuer} is not an active university in the registry`,
      `${issuerName} is an active issuer`
    );
  });

  await run("attestation", "ECDSA batch attestation", () => {
    const recovered = recoverAttestationSigner(
      vc.chainId,
      vc.verifyingContract,
      {
        merkleRoot: vc.merkleRoot,
        credentialCount: vc.credentialCount,
        degreeType: credential.degreeType,
        graduationYear: credential.graduationYear
      },
      vc.attestationSignature
    );
    return assert(
      recovered.toLowerCase() === credential.issuer.toLowerCase() &&
        vc.verifyingContract.toLowerCase() === deps.credentialRegistry.toLowerCase(),
      "Attestation signature was not produced by the issuer for this registry",
      `secp256k1 signature recovers to ${shortHex(recovered)}`
    );
  });

  await run("commitment", "Credential commitment", () => {
    const recomputed = credentialLeaf(credential);
    return assert(
      recomputed.toLowerCase() === vc.leaf.toLowerCase(),
      "Presented fields do not hash to the committed leaf (credential was altered)",
      `EIP-712 hash ${shortHex(recomputed)} matches the committed leaf`
    );
  });

  await run("merkle", "Merkle inclusion proof", () =>
    assert(
      verifyMerkleProof(vc.merkleRoot, vc.leaf, vc.proof),
      "Merkle proof does not fold to the attested root",
      `${vc.proof.length} sibling hashes fold to the signed root`
    )
  );

  await run("chain", "On-chain anchor", async () => {
    const network = await deps.provider.getNetwork();
    if (Number(network.chainId) !== vc.chainId) {
      throw new Error(`Credential was issued on chain ${vc.chainId}, provider is on ${network.chainId}`);
    }

    const record = await credentialRegistry.batch(vc.batchId);
    if (record.merkleRoot === "0x" + "0".repeat(64)) {
      throw new Error(`Batch #${vc.batchId} is not anchored on this registry`);
    }
    if (record.merkleRoot.toLowerCase() !== vc.merkleRoot.toLowerCase()) {
      throw new Error("Presented root does not match the root anchored on-chain");
    }
    if (record.issuer.toLowerCase() !== credential.issuer.toLowerCase()) {
      throw new Error("Anchored batch was issued by a different university");
    }

    const accepted: boolean = await credentialRegistry.verifyCredential(vc.batchId, vc.leaf, vc.proof);
    if (!accepted) throw new Error("Smart contract rejected the Merkle proof");

    batch = {
      id: vc.batchId,
      issuer: record.issuer,
      merkleRoot: record.merkleRoot,
      credentialCount: Number(record.credentialCount),
      issuedAt: Number(record.issuedAt),
      graduationYear: Number(record.graduationYear),
      degreeType: record.degreeType
    };
    return `Batch #${vc.batchId} · ${record.credentialCount} credentials · proof accepted by contract`;
  });

  return {
    ok: steps.every((step) => step.ok),
    steps,
    totalMs: round(clock() - startedAt),
    issuerName,
    batch
  };
}

export function shortHex(value: string, head = 10, tail = 6): string {
  if (!value) return "—";
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
