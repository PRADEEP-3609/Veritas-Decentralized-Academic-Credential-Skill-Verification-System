import { artifacts, ethers, network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

const UNIVERSITY_NAME = "Presidency University";

async function main() {
  const signers = await ethers.getSigners();
  const [owner, admin] = signers;
  const students = signers.slice(2, 7);
  const teachers = signers.slice(7, 10);

  console.log(`Deploying to ${network.name} as ${owner.address}`);

  const UniversityRegistry = await ethers.getContractFactory("UniversityRegistry");
  const universityRegistry = await UniversityRegistry.deploy();
  await universityRegistry.waitForDeployment();

  const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
  const credentialRegistry = await CredentialRegistry.deploy(await universityRegistry.getAddress());
  await credentialRegistry.waitForDeployment();

  const registration = await universityRegistry.registerUniversity(admin.address, UNIVERSITY_NAME);
  await registration.wait();

  const [registryArtifact, credentialsArtifact] = await Promise.all([
    artifacts.readArtifact("UniversityRegistry"),
    artifacts.readArtifact("CredentialRegistry")
  ]);

  const deployment = {
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    network: network.name,
    universityName: UNIVERSITY_NAME,
    roles: {
      owner: owner.address,
      admin: admin.address,
      teachers: teachers.map((teacher) => teacher.address),
      students: students.map((student) => student.address)
    },
    contracts: {
      universityRegistry: {
        address: await universityRegistry.getAddress(),
        abi: registryArtifact.abi
      },
      credentialRegistry: {
        address: await credentialRegistry.getAddress(),
        abi: credentialsArtifact.abi
      }
    }
  };

  const outputPath = path.resolve(process.cwd(), "web/src/generated/deployment.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);

  console.log(`UniversityRegistry  ${deployment.contracts.universityRegistry.address}`);
  console.log(`CredentialRegistry  ${deployment.contracts.credentialRegistry.address}`);
  console.log(`Registered issuer   ${admin.address} (${UNIVERSITY_NAME})`);
  console.log(`Wrote               ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
