import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { buildMerkleTree, getProof } from "../shared/merkle";
import { credentialLeaf, didForAddress, signBatchAttestation } from "../shared/credential";
import { verifyPresentation } from "../shared/verify";
import type { VerifiableCredential } from "../shared/types";

const DEGREE_TYPE = "B.Tech";
const GRADUATION_YEAR = 2026;

const ROSTER = [
  { name: "Aarav Mehta", field: "Computer Science" },
  { name: "Sofia Ramirez", field: "Data Science" },
  { name: "Liang Chen", field: "Electrical Engineering" },
  { name: "Amara Okafor", field: "Information Systems" },
  { name: "Noah Fischer", field: "Mechanical Engineering" }
];

interface Deployment {
  chainId: number;
  universityName: string;
  contracts: {
    universityRegistry: { address: string; abi: unknown[] };
    credentialRegistry: { address: string; abi: unknown[] };
  };
}

function readDeployment(): Deployment {
  const file = path.resolve(process.cwd(), "web/src/generated/deployment.json");
  if (!fs.existsSync(file)) throw new Error("Deployment not found. Run `npm run deploy` first.");
  return JSON.parse(fs.readFileSync(file, "utf8")) as Deployment;
}

async function main() {
  const deployment = readDeployment();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== deployment.chainId) {
    throw new Error(`Deployment targets chain ${deployment.chainId}, node is on ${chainId}`);
  }

  const signers = await ethers.getSigners();
  const university = signers[1];
  const students = signers.slice(2, 7);

  const credentialRegistry = new ethers.Contract(
    deployment.contracts.credentialRegistry.address,
    deployment.contracts.credentialRegistry.abi as ethers.InterfaceAbi,
    university
  );
  const universityRegistry = new ethers.Contract(
    deployment.contracts.universityRegistry.address,
    deployment.contracts.universityRegistry.abi as ethers.InterfaceAbi,
    ethers.provider
  );

  if (!(await universityRegistry.isUniversity(university.address))) {
    throw new Error(`University ${university.address} is not registered. Re-run deploy.`);
  }

  const credentials = ROSTER.map((entry, index) => ({
    issuer: university.address,
    studentDid: didForAddress(students[index].address),
    studentName: entry.name,
    degreeType: DEGREE_TYPE,
    fieldOfStudy: entry.field,
    graduationYear: GRADUATION_YEAR,
    credentialId: `VT-${GRADUATION_YEAR}-${String(index + 1).padStart(3, "0")}`
  }));

  const leaves = credentials.map(credentialLeaf);
  const tree = buildMerkleTree(leaves);

  const attestation = {
    merkleRoot: tree.root,
    credentialCount: credentials.length,
    degreeType: DEGREE_TYPE,
    graduationYear: GRADUATION_YEAR
  };

  console.log("Signing batch root with the registrar key…");
  const attestationSignature = await signBatchAttestation(
    university,
    chainId,
    await credentialRegistry.getAddress(),
    attestation
  );

  console.log("Anchoring Merkle root on-chain…");
  const tx = await credentialRegistry.issueBatch(
    tree.root,
    credentials.length,
    GRADUATION_YEAR,
    DEGREE_TYPE
  );
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Batch transaction was not mined");

  const event = receipt.logs
    .map((log) => {
      try {
        return credentialRegistry.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "BatchIssued");
  if (!event) throw new Error("BatchIssued event missing from receipt");
  const batchId = Number(event.args.batchId);

  const block = await ethers.provider.getBlock(receipt.blockNumber);

  const vcs: VerifiableCredential[] = credentials.map((credential, index) => ({
    version: "1.0",
    chainId,
    verifyingContract: deployment.contracts.credentialRegistry.address,
    batchId,
    credentialCount: credentials.length,
    merkleRoot: tree.root,
    leaf: leaves[index],
    proof: getProof(tree, index),
    attestationSignature,
    issuedAt: block?.timestamp ?? 0,
    txHash: receipt.hash,
    credential
  }));

  console.log(`\nBatch #${batchId} anchored in ${receipt.hash}`);
  console.log(`Root ${tree.root}  ·  gas ${receipt.gasUsed.toString()}\n`);

  for (const vc of vcs) {
    const report = await verifyPresentation(vc, {
      provider: ethers.provider,
      credentialRegistry: deployment.contracts.credentialRegistry.address,
      universityRegistry: deployment.contracts.universityRegistry.address
    });
    const failed = report.steps.filter((step) => !step.ok).map((step) => step.id);
    console.log(
      `${report.ok ? "PASS" : "FAIL"}  ${vc.credential.studentName.padEnd(16)} ${report.totalMs
        .toFixed(2)
        .padStart(7)} ms  ${vc.credential.studentDid}${failed.length ? `  [${failed.join(", ")}]` : ""}`
    );
    if (!report.ok) {
      for (const step of report.steps.filter((item) => !item.ok)) {
        console.log(`      ${step.id}: ${step.detail}`);
      }
      process.exitCode = 1;
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    universityName: deployment.universityName,
    batch: {
      id: batchId,
      merkleRoot: tree.root,
      credentialCount: credentials.length,
      degreeType: DEGREE_TYPE,
      graduationYear: GRADUATION_YEAR,
      txHash: receipt.hash
    },
    vcs
  };

  const outputPath = path.resolve(process.cwd(), "web/public/sample-credentials.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nWrote ${vcs.length} credentials to ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
