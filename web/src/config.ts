import {
  Contract,
  HDNodeWallet,
  JsonRpcProvider,
  ZeroAddress,
  type ContractTransactionResponse,
  type Signer
} from "ethers";
import deploymentJson from "./generated/deployment.json";
import type { VerifiableCredential } from "@shared/types";

export interface BatchStruct {
  issuer: string;
  merkleRoot: string;
  credentialCount: bigint;
  issuedAt: bigint;
  graduationYear: bigint;
  degreeType: string;
}

interface Deployment {
  chainId: number;
  deployedAt: string;
  network: string;
  universityName: string;
  roles: {
    owner: string;
    admin: string;
    teachers: string[];
    students: string[];
  };
  contracts: {
    universityRegistry: { address: string; abi: unknown[] };
    credentialRegistry: { address: string; abi: unknown[] };
  };
}

export interface CredentialBundle {
  generatedAt: string;
  universityName: string;
  batch: {
    id: number;
    merkleRoot: string;
    credentialCount: number;
    degreeType: string;
    graduationYear: number;
    txHash: string;
  };
  vcs: VerifiableCredential[];
}

export const deployment = deploymentJson as unknown as Deployment;

export const RPC_URL = "http://127.0.0.1:8545";
export const CHAIN_ID = deployment.chainId || 31337;
export const universityName = deployment.universityName || "Presidency University";
export const deploymentReady =
  deployment.contracts.credentialRegistry.address !== ZeroAddress &&
  deployment.contracts.credentialRegistry.abi.length > 0;

export const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });

/// Hardhat's publicly known development mnemonic. Test-network only: a real
/// deployment keeps issuer keys in an HSM and holder keys in the student's wallet.
export const TEST_MNEMONIC = "test test test test test test test test test test test junk";

export function testSigner(index: number): HDNodeWallet {
  const wallet = HDNodeWallet.fromPhrase(TEST_MNEMONIC, undefined, `m/44'/60'/0'/0/${index}`);
  return wallet.connect(provider);
}

export interface CredentialRegistryContract extends Contract {
  batchCount(): Promise<bigint>;
  batch(batchId: number | bigint): Promise<BatchStruct>;
  verifyCredential(batchId: number | bigint, leaf: string, proof: string[]): Promise<boolean>;
  issueBatch(
    merkleRoot: string,
    credentialCount: number,
    graduationYear: number,
    degreeType: string
  ): Promise<ContractTransactionResponse>;
}

export interface UniversityRegistryContract extends Contract {
  isUniversity(account: string): Promise<boolean>;
  nameOf(account: string): Promise<string>;
}

export const credentialRegistry = new Contract(
  deployment.contracts.credentialRegistry.address,
  deployment.contracts.credentialRegistry.abi,
  provider
) as unknown as CredentialRegistryContract;

export const universityRegistry = new Contract(
  deployment.contracts.universityRegistry.address,
  deployment.contracts.universityRegistry.abi,
  provider
) as unknown as UniversityRegistryContract;

export function credentialRegistryFor(signer: Signer): CredentialRegistryContract {
  return credentialRegistry.connect(signer) as unknown as CredentialRegistryContract;
}

/// The institution's accredited issuer key, registered by the deployment script.
/// Every administrator account issues "on behalf of the institution" with this
/// key; a production registrar keeps it in an HSM rather than in the browser.
export const universitySigner = () => testSigner(1);

export const adminAddress = deployment.roles.admin ?? "";
export const walletScope = deployment.contracts.credentialRegistry.address;

export const DEGREE_TYPES = [
  "B.Tech",
  "B.E.",
  "B.Sc.",
  "BBA",
  "B.Com.",
  "BCA",
  "M.Tech",
  "M.Sc.",
  "MBA",
  "MCA",
  "Ph.D."
];

export function shortAddress(value: string): string {
  if (!value) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
