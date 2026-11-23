import { expect } from "chai";
import { ethers } from "hardhat";
import { buildMerkleTree, getProof } from "../shared/merkle";
import {
  credentialLeaf,
  didForAddress,
  recoverAttestationSigner,
  signBatchAttestation
} from "../shared/credential";
import type { DegreeCredential } from "../shared/types";

const DEGREE = "B.Tech";
const YEAR = 2026;

function makeCredentials(issuer: string, students: string[], label = "VT"): DegreeCredential[] {
  return students.map((address, index) => ({
    issuer,
    studentDid: didForAddress(address),
    studentName: `Student ${label}${index + 1}`,
    degreeType: DEGREE,
    fieldOfStudy: "Computer Science",
    graduationYear: YEAR,
    credentialId: `${label}-${YEAR}-${index + 1}`
  }));
}

describe("Veritas credential network", () => {
  async function fixture() {
    const [admin, university, outsider, ...students] = await ethers.getSigners();

    const UniversityRegistry = await ethers.getContractFactory("UniversityRegistry");
    const universityRegistry = await UniversityRegistry.deploy();
    await universityRegistry.waitForDeployment();

    const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
    const credentialRegistry = await CredentialRegistry.deploy(await universityRegistry.getAddress());
    await credentialRegistry.waitForDeployment();

    await universityRegistry.registerUniversity(university.address, "Presidency University");

    return { admin, university, outsider, students, universityRegistry, credentialRegistry };
  }

  async function anchor(
    contract: Awaited<ReturnType<typeof fixture>>["credentialRegistry"],
    signer: Awaited<ReturnType<typeof fixture>>["university"],
    credentials: DegreeCredential[]
  ) {
    const leaves = credentials.map(credentialLeaf);
    const tree = buildMerkleTree(leaves);
    const tx = await contract.connect(signer).issueBatch(tree.root, credentials.length, YEAR, DEGREE);
    const receipt = await tx.wait();
    return { leaves, tree, receipt, batchId: Number(await contract.batchCount()) };
  }

  it("lets the owner register a university", async () => {
    const { admin, university, universityRegistry } = await fixture();
    expect(await universityRegistry.isUniversity(university.address)).to.equal(true);
    expect(await universityRegistry.nameOf(university.address)).to.equal("Presidency University");

    await expect(
      universityRegistry.connect(university).registerUniversity(university.address, "Self Appointed")
    ).to.be.revertedWithCustomError(universityRegistry, "OwnableUnauthorizedAccount");

    expect(await universityRegistry.connect(admin).isUniversity(university.address)).to.equal(true);
  });

  it("anchors a batch and verifies every credential on-chain", async () => {
    const { university, students, credentialRegistry } = await fixture();
    const credentials = makeCredentials(university.address, students.slice(0, 4).map((s) => s.address));

    const { leaves, tree, receipt, batchId } = await anchor(credentialRegistry, university, credentials);
    expect(receipt?.status).to.equal(1);
    expect(batchId).to.equal(1);

    const batch = await credentialRegistry.batch(batchId);
    expect(batch.issuer).to.equal(university.address);
    expect(batch.merkleRoot).to.equal(tree.root);
    expect(Number(batch.credentialCount)).to.equal(4);
    expect(Number(batch.graduationYear)).to.equal(YEAR);
    expect(batch.degreeType).to.equal(DEGREE);

    for (let index = 0; index < leaves.length; index++) {
      expect(await credentialRegistry.verifyCredential(batchId, leaves[index], getProof(tree, index))).to.equal(true);
    }
  });

  it("rejects issuers that are not registered universities", async () => {
    const { outsider, students, credentialRegistry } = await fixture();
    const credentials = makeCredentials(outsider.address, students.slice(0, 2).map((s) => s.address));
    const tree = buildMerkleTree(credentials.map(credentialLeaf));

    await expect(
      credentialRegistry.connect(outsider).issueBatch(tree.root, 2, YEAR, DEGREE)
    ).to.be.revertedWith("CredentialRegistry: issuer not registered");
  });

  it("rejects proofs from a different batch", async () => {
    const { university, students, credentialRegistry } = await fixture();

    const first = await anchor(
      credentialRegistry,
      university,
      makeCredentials(university.address, students.slice(0, 3).map((s) => s.address), "A")
    );
    const second = await anchor(
      credentialRegistry,
      university,
      makeCredentials(university.address, students.slice(3, 6).map((s) => s.address), "B")
    );

    const proof = getProof(first.tree, 0);
    expect(await credentialRegistry.verifyCredential(first.batchId, first.leaves[0], proof)).to.equal(true);
    expect(await credentialRegistry.verifyCredential(second.batchId, first.leaves[0], proof)).to.equal(false);
  });

  it("rejects a credential whose fields were altered", async () => {
    const { university, students, credentialRegistry } = await fixture();
    const credentials = makeCredentials(university.address, students.slice(0, 3).map((s) => s.address));
    const { leaves, tree, batchId } = await anchor(credentialRegistry, university, credentials);

    const altered = { ...credentials[1], degreeType: "Ph.D." };
    const forgedLeaf = credentialLeaf(altered);
    expect(forgedLeaf).to.not.equal(leaves[1]);
    expect(await credentialRegistry.verifyCredential(batchId, forgedLeaf, getProof(tree, 1))).to.equal(false);
  });

  it("binds the batch root attestation to the issuer via ECDSA", async () => {
    const { university, outsider, students, credentialRegistry } = await fixture();
    const credentials = makeCredentials(university.address, students.slice(0, 2).map((s) => s.address));
    const tree = buildMerkleTree(credentials.map(credentialLeaf));

    const chainId = Number((await ethers.provider.getNetwork()).chainId);
    const contractAddress = await credentialRegistry.getAddress();
    const attestation = {
      merkleRoot: tree.root,
      credentialCount: credentials.length,
      degreeType: DEGREE,
      graduationYear: YEAR
    };

    const signature = await signBatchAttestation(university, chainId, contractAddress, attestation);
    expect(recoverAttestationSigner(chainId, contractAddress, attestation, signature)).to.equal(university.address);

    const forgedSignature = await signBatchAttestation(outsider, chainId, contractAddress, attestation);
    expect(recoverAttestationSigner(chainId, contractAddress, attestation, forgedSignature)).to.equal(outsider.address);
    expect(recoverAttestationSigner(chainId, contractAddress, attestation, forgedSignature)).to.not.equal(
      university.address
    );

    const tampered = { ...attestation, credentialCount: credentials.length + 1 };
    expect(recoverAttestationSigner(chainId, contractAddress, tampered, signature)).to.not.equal(university.address);
  });

  it("blocks deactivated issuers but keeps historical batches verifiable", async () => {
    const { admin, university, students, universityRegistry, credentialRegistry } = await fixture();
    const credentials = makeCredentials(university.address, students.slice(0, 2).map((s) => s.address));
    const { leaves, tree, batchId } = await anchor(credentialRegistry, university, credentials);

    await universityRegistry.setUniversityActive(university.address, false);
    expect(await universityRegistry.isUniversity(university.address)).to.equal(false);

    await expect(
      credentialRegistry.connect(university).issueBatch(tree.root, 2, YEAR, DEGREE)
    ).to.be.revertedWith("CredentialRegistry: issuer not registered");

    expect(await credentialRegistry.verifyCredential(batchId, leaves[0], getProof(tree, 0))).to.equal(true);

    await expect(
      universityRegistry.connect(university).setUniversityActive(university.address, true)
    ).to.be.revertedWithCustomError(universityRegistry, "OwnableUnauthorizedAccount");

    await universityRegistry.connect(admin).setUniversityActive(university.address, true);
    expect(await universityRegistry.isUniversity(university.address)).to.equal(true);
  });
});
