import { ethers } from "hardhat";
import fs from "node:fs";
import { verifyPresentation } from "../shared/verify";
import type { VerifiableCredential } from "../shared/types";
import deployment from "../web/src/generated/deployment.json";

const RPC_URL = "http://127.0.0.1:8545";

async function main() {
  const bundle = JSON.parse(fs.readFileSync("web/public/sample-credentials.json", "utf8"));
  const original: VerifiableCredential = bundle.vcs[0];
  const forged: VerifiableCredential = {
    ...original,
    credential: { ...original.credential, degreeType: "Ph.D.", fieldOfStudy: "Quantum Ethics" }
  };

  const provider = new ethers.JsonRpcProvider(RPC_URL, deployment.chainId, { staticNetwork: true });
  const deps = {
    provider,
    credentialRegistry: deployment.contracts.credentialRegistry.address,
    universityRegistry: deployment.contracts.universityRegistry.address
  };

  for (const [label, vc] of [["original", original], ["forged", forged]] as const) {
    const report = await verifyPresentation(vc, deps);
    console.log(`\n${label}: ok=${report.ok} total=${report.totalMs}ms`);
    for (const step of report.steps) {
      console.log(`  ${step.ok ? "PASS" : "FAIL"} ${step.id.padEnd(12)} ${String(step.ms).padStart(6)} ms  ${step.detail}`);
    }
    if (label === "original" && !report.ok) process.exitCode = 1;
    if (label === "forged" && report.ok) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
