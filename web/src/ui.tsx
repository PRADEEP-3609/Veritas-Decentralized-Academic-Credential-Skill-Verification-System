import { useState, type ReactNode } from "react";
import { ROLE_INFO, permissionsFor, type Role } from "./lib/roles";

export function RolePill({ role }: { role: Role }) {
  return <span className={`role-pill is-${role}`}>{ROLE_INFO[role].label}</span>;
}

export function AccessList({ role }: { role: Role }) {
  return (
    <ul className="access-list">
      {permissionsFor(role).map((permission) => (
        <li key={permission.id}>
          <span className="access-check" aria-hidden="true">
            ✓
          </span>
          <span>
            <strong>{permission.label}</strong>
            <small>{permission.description}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className={`copy-btn${copied ? " is-copied" : ""}`} onClick={copy}>
      {copied ? "Copied" : label}
    </button>
  );
}

export function Hash({ value, head = 10, tail = 8 }: { value?: string; head?: number; tail?: number }) {
  if (!value) return <span className="mono dim">—</span>;
  return (
    <span className="mono" title={value}>
      {value.slice(0, head)}…{value.slice(-tail)}
    </span>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kv">
      <span className="kv-label">{label}</span>
      <span className="kv-value">{children}</span>
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="callout">
      <span className="callout-title">{title}</span>
      <p>{children}</p>
    </div>
  );
}
