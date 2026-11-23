import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { buildMerkleTree, getProof, verifyMerkleProof } from "../shared/merkle";
import { credentialLeaf } from "../shared/credential";
import type { DegreeCredential } from "../shared/types";

const COHORTS = [1, 10, 50, 100, 500, 1000];
const DEGREE_TYPE = "B.Sc.";
const YEAR = 2026;

const clock = () => performance.now();
const round = (value: number) => Math.round(value * 100) / 100;

function cohort(size: number, issuer: string): DegreeCredential[] {
  return Array.from({ length: size }, (_, index) => ({
    issuer,
    studentDid: `did:ethr:0x${String(index + 1).padStart(40, "0")}`,
    studentName: `Student ${index + 1}`,
    degreeType: DEGREE_TYPE,
    fieldOfStudy: index % 2 === 0 ? "Computer Science" : "Data Science",
    graduationYear: YEAR,
    credentialId: `VT-${YEAR}-${String(index + 1).padStart(5, "0")}`
  }));
}

interface Row {
  size: number;
  prepMs: number;
  proofDepth: number;
  proofMs: number;
  offchainMs: number;
  onchainMs: number;
  anchorGas: string;
}

async function main() {
  const [, university] = await ethers.getSigners();

  const UniversityRegistry = await ethers.getContractFactory("UniversityRegistry");
  const registry = await UniversityRegistry.deploy();
  await registry.waitForDeployment();
  await (await registry.registerUniversity(university.address, "Presidency University")).wait();

  const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
  const credentialContract = await CredentialRegistry.deploy(await registry.getAddress());
  await credentialContract.waitForDeployment();
  const asIssuer = credentialContract.connect(university);

  const rows: Row[] = [];

  for (const size of COHORTS) {
    const credentials = cohort(size, university.address);

    const started = clock();
    const leaves = credentials.map(credentialLeaf);
    const tree = buildMerkleTree(leaves);
    const prepMs = clock() - started;

    const tx = await asIssuer.issueBatch(tree.root, size, YEAR, DEGREE_TYPE);
    const receipt = await tx.wait();
    if (!receipt) throw new Error("Benchmark batch was not mined");
    const batchId = Number(await credentialContract.batchCount());

    const sample = Math.min(25, size);
    const indices = Array.from({ length: sample }, (_, i) => Math.floor((i * size) / sample));

    let proofTotal = 0;
    let offchainTotal = 0;
    let onchainTotal = 0;
    let proofDepth = 0;

    for (const index of indices) {
      let t = clock();
      const proof = getProof(tree, index);
      proofTotal += clock() - t;
      proofDepth += proof.length;

      t = clock();
      const okOffchain = verifyMerkleProof(tree.root, leaves[index], proof);
      offchainTotal += clock() - t;
      if (!okOffchain) throw new Error("Off-chain proof failed during benchmark");

      t = clock();
      const okOnchain: boolean = await credentialContract.verifyCredential(batchId, leaves[index], proof);
      onchainTotal += clock() - t;
      if (!okOnchain) throw new Error("On-chain proof failed during benchmark");
    }

    rows.push({
      size,
      prepMs: round(prepMs),
      proofDepth: round(proofDepth / sample),
      proofMs: round(proofTotal / sample),
      offchainMs: round(offchainTotal / sample),
      onchainMs: round(onchainTotal / sample),
      anchorGas: receipt.gasUsed.toLocaleString("en-US")
    });

    console.log(
      `n=${String(size).padStart(4)}  prep ${prepMs.toFixed(1).padStart(6)} ms  ` +
        `proof ${(proofTotal / sample).toFixed(3)} ms  off-chain ${(offchainTotal / sample).toFixed(3)} ms  ` +
        `on-chain ${(onchainTotal / sample).toFixed(2)} ms  gas ${receipt.gasUsed}`
    );
  }

  const header = `| Credentials | Batch prep (ms) | Avg proof depth | Proof gen (ms) | Off-chain verify (ms) | On-chain verify (ms) | Anchor gas |\n` +
    `| ---: | ---: | ---: | ---: | ---: | ---: | ---: |`;
  const table = rows
    .map(
      (row) =>
        `| ${row.size} | ${row.prepMs} | ${row.proofDepth} | ${row.proofMs} | ${row.offchainMs} | ${row.onchainMs} | ${row.anchorGas} |`
    )
    .join("\n");

  const markdown = `# Benchmark results\n\n` +
    `Generated ${new Date().toISOString()} on a local Hardhat node (chainId 31337), Node ${process.version}.\n` +
    `Times are per operation averaged over up to 25 sampled credentials per cohort.\n\n` +
    `${header}\n${table}\n\n` +
    `The anchor gas column is the single \`issueBatch\` transaction for the whole cohort, so on-chain storage cost is O(1) in the number of graduates.\n`;

  const docsDir = path.resolve(process.cwd(), "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, "benchmark-results.md"), markdown);
  console.log(`\nWrote docs/benchmark-results.md`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
