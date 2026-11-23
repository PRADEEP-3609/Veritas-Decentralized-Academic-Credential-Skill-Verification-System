export interface DegreeCredential {
  issuer: string;
  studentDid: string;
  studentName: string;
  degreeType: string;
  fieldOfStudy: string;
  graduationYear: number;
  credentialId: string;
}

export interface VerifiableCredential {
  version: "1.0";
  chainId: number;
  verifyingContract: string;
  batchId: number;
  credentialCount: number;
  merkleRoot: string;
  leaf: string;
  proof: string[];
  attestationSignature: string;
  issuedAt: number;
  txHash: string;
  credential: DegreeCredential;
}

export interface BatchRecord {
  issuer: string;
  merkleRoot: string;
  credentialCount: number;
  issuedAt: number;
  graduationYear: number;
  degreeType: string;
}
