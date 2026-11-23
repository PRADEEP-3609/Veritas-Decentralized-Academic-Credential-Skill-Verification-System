import { useCallback, useEffect, useState } from "react";
import type { VerifiableCredential } from "@shared/types";
import {
  RPC_URL,
  credentialRegistry,
  deployment,
  deploymentReady,
  provider,
  shortAddress,
  universityName,
  walletScope,
  type CredentialBundle
} from "./config";
import { clearSession, loadAccounts, loadSessionAccount, saveSession } from "./lib/auth";
import { ROLE_INFO, type Account } from "./lib/roles";
import { clearWallet, loadWallet, saveWallet, totalCredentials, withCredentials, type WalletMap } from "./lib/walletStore";
import AdminPanel from "./panels/AdminPanel";
import AuthPanel from "./panels/AuthPanel";
import StudentPanel from "./panels/StudentPanel";
import TeacherPanel from "./panels/TeacherPanel";
import { RolePill } from "./ui";

interface NetworkState {
  status: "connecting" | "online" | "offline";
  block: number;
  batches: number;
}

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  const [account, setAccount] = useState<Account | null>(() => loadSessionAccount());
  const [network, setNetwork] = useState<NetworkState>({ status: "connecting", block: 0, batches: 0 });
  const [wallet, setWallet] = useState<WalletMap>(() => loadWallet(walletScope));
  const [sample, setSample] = useState<CredentialBundle | null>(null);
  const [presentation, setPresentation] = useState<VerifiableCredential | null>(null);
  const [lastVerifiedMs, setLastVerifiedMs] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    saveWallet(walletScope, wallet);
  }, [wallet]);

  useEffect(() => {
    if (account) saveSession(account.id);
    else clearSession();
  }, [account]);

  useEffect(() => {
    let active = true;
    fetch("/sample-credentials.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((file: CredentialBundle | null) => {
        if (active && file?.vcs?.length) setSample(file);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!deploymentReady) return;
    let active = true;

    const poll = async () => {
      try {
        const [block, batches] = await Promise.all([provider.getBlockNumber(), credentialRegistry.batchCount()]);
        if (active) setNetwork({ status: "online", block, batches: Number(batches) });
      } catch {
        if (active) setNetwork({ status: "offline", block: 0, batches: 0 });
      }
    };

    poll();
    const timer = window.setInterval(poll, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const handleAuthenticated = (next: Account) => {
    setAccounts(loadAccounts());
    setAccount(next);
  };

  const handleSignOut = () => {
    clearSession();
    setAccount(null);
  };

  const handleDirectoryChanged = useCallback(() => {
    setAccounts(loadAccounts());
  }, []);

  const handleIssued = useCallback((credentials: VerifiableCredential[]) => {
    setWallet((current) => withCredentials(current, credentials));
    setRefresh((value) => value + 1);
  }, []);

  const resetWallet = () => {
    if (!window.confirm("Clear the demo wallets stored in this browser?")) return;
    clearWallet(walletScope);
    setWallet({});
  };

  const students = accounts.filter((member) => member.role === "student");
  const heldCredentials = totalCredentials(wallet);
  const ownCredentials = account ? wallet[account.address.toLowerCase()]?.length ?? 0 : 0;

  return (
    <div className="app">
      <TopBar account={account} network={network} onSignOut={handleSignOut} />

      {account ? (
        <>
          <WorkspaceHead
            account={account}
            network={network}
            ownCredentials={ownCredentials}
            heldCredentials={heldCredentials}
            members={accounts.length}
            lastVerifiedMs={lastVerifiedMs}
          />
          <div className="container">
            <main>
              {!deploymentReady ? (
                <SetupCard />
              ) : (
                <>
                  {network.status === "offline" && (
                    <div className="alert alert-warn">
                      Cannot reach the JSON-RPC node at <code className="mono">{RPC_URL}</code>. Start it with{" "}
                      <code className="mono">npm run chain</code> and the page will reconnect automatically.
                    </div>
                  )}
                  {account.role === "admin" && (
                    <AdminPanel
                      account={account}
                      students={students}
                      members={accounts}
                      wallet={wallet}
                      onIssued={handleIssued}
                      onDirectoryChanged={handleDirectoryChanged}
                    />
                  )}
                  {account.role === "teacher" && (
                    <TeacherPanel
                      teacher={account}
                      students={students}
                      wallet={wallet}
                      presentation={presentation}
                      sample={sample}
                      onVerified={(totalMs) => setLastVerifiedMs(totalMs)}
                    />
                  )}
                  {account.role === "student" && (
                    <StudentPanel student={account} wallet={wallet} onPresent={setPresentation} />
                  )}
                </>
              )}
            </main>
          </div>
        </>
      ) : (
        <>
          <AuthHero sample={sample} network={network} />
          <div className="container">
            <AuthPanel onAuthenticated={handleAuthenticated} />
            {!deploymentReady && (
              <div className="alert alert-warn auth-deploy-note">
                The credential registry is not deployed yet. You can create accounts, but issuance needs the local chain
                and <code className="mono">npm run setup</code>.
              </div>
            )}
          </div>
        </>
      )}

      <footer className="footer">
        <div className="footer-inner">
          <span>Veritas · Solidity · Hardhat · React</span>
          <span className="mono muted">
            {deploymentReady ? shortAddress(deployment.contracts.credentialRegistry.address) : "Awaiting deployment"}
          </span>
          <button type="button" className="link-btn" onClick={resetWallet}>
            Reset demo wallets
          </button>
        </div>
      </footer>
    </div>
  );
}

function TopBar({
  account,
  network,
  onSignOut
}: {
  account: Account | null;
  network: NetworkState;
  onSignOut: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <span className="brand-mark">V</span>
          <span className="brand-copy">
            <strong>Veritas</strong>
            <small>{universityName} · Academic Credential Network</small>
          </span>
        </div>
        <div className="topbar-right">
          {account ? (
            <div className="whoami">
              <span className="avatar avatar-sm">{initials(account.name)}</span>
              <span className="whoami-copy">
                <span className="whoami-label">Signed in as</span>
                <strong className="whoami-name">{account.name}</strong>
              </span>
              <RolePill role={account.role} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={onSignOut}>
                Sign out
              </button>
            </div>
          ) : (
            <span className="topbar-note">Institution sign-in</span>
          )}
          <span className={`net-pill is-${deploymentReady ? network.status : "offline"}`}>
            <span className="dot" />
            {!deploymentReady
              ? "Awaiting deployment"
              : network.status === "online"
                ? `Chain ${deployment.chainId} · block ${network.block}`
                : network.status === "connecting"
                  ? "Connecting to chain…"
                  : "Chain offline"}
          </span>
        </div>
      </div>
    </header>
  );
}

function WorkspaceHead({
  account,
  network,
  ownCredentials,
  heldCredentials,
  members,
  lastVerifiedMs
}: {
  account: Account;
  network: NetworkState;
  ownCredentials: number;
  heldCredentials: number;
  members: number;
  lastVerifiedMs: number | null;
}) {
  return (
    <section className="workspace-head">
      <div className="workspace-head-inner">
        <div className="workspace-title">
          <span className="hero-eyebrow">{ROLE_INFO[account.role].label} workspace</span>
          <h1>{account.name}</h1>
          <p>
            {account.detail} <span className="workspace-handle">@{account.username}</span>
          </p>
        </div>
        <div className="workspace-stats">
          <div>
            <span>Batches anchored</span>
            <strong>{network.status === "online" ? network.batches : "—"}</strong>
          </div>
          <div>
            <span>{account.role === "student" ? "Your credentials" : "Credentials held"}</span>
            <strong>{account.role === "student" ? ownCredentials : heldCredentials}</strong>
          </div>
          <div>
            <span>Members on file</span>
            <strong>{members}</strong>
          </div>
          <div>
            <span>Last verification</span>
            <strong>{lastVerifiedMs !== null ? `${lastVerifiedMs.toFixed(0)} ms` : "—"}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function AuthHero({ sample, network }: { sample: CredentialBundle | null; network: NetworkState }) {
  return (
    <section className="hero">
      <div className="hero-inner">
        <div className="hero-copy">
          <span className="hero-eyebrow">Decentralized identity &nbsp;·&nbsp; Merkle proofs &nbsp;·&nbsp; ECDSA</span>
          <h1>Degrees that prove themselves.</h1>
          <p>
            {universityName} anchors one Merkle root per graduating class. Students create an account, receive a
            decentralized identifier and carry signed credentials bound to it. Teachers and employers verify
            authenticity in seconds — no registrar calls, no background check agency.
          </p>
          <div className="hero-meta">
            <div>
              <span>Batches anchored</span>
              <strong>{network.status === "online" ? network.batches : "—"}</strong>
            </div>
            <div>
              <span>Checks per presentation</span>
              <strong>7</strong>
            </div>
            <div>
              <span>Verifier gas</span>
              <strong>0</strong>
            </div>
          </div>
        </div>

        <aside className="hero-card">
          <span className="kicker">Latest cohort anchor</span>
          {sample ? (
            <>
              <div className="hero-card-degree">
                {sample.batch.degreeType} · {sample.batch.graduationYear}
              </div>
              <div className="hero-root">
                <span>Merkle root</span>
                <code>
                  {sample.batch.merkleRoot.slice(0, 22)}…{sample.batch.merkleRoot.slice(-8)}
                </code>
              </div>
              <div className="hero-card-meta">
                <span>{sample.batch.credentialCount} credentials</span>
                <span>1 tx</span>
                <span>1 signature</span>
              </div>
            </>
          ) : (
            <p className="muted">
              No cohort anchored yet. Run <code className="mono">npm run setup</code> against the local chain to load the
              sample graduating class.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

function SetupCard() {
  return (
    <section className="card setup-card">
      <span className="empty-mark">!</span>
      <h2>Deploy the contracts first</h2>
      <p>
        The interface is running, but no registry deployment was found. Start the local chain in one terminal and run
        the setup in another.
      </p>
      <div className="command-block">
        <code>npm run chain</code>
        <code>npm run setup</code>
      </div>
      <p className="hint">The setup registers {universityName} as an issuer and anchors a sample cohort.</p>
    </section>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
