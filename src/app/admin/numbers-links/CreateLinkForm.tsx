"use client";

import { useActionState } from "react";

import { createNumbersLink, type CreateLinkState } from "../numbers-actions";

const TABS = [
  { value: "product", label: "Product" },
  { value: "website", label: "Website" },
  { value: "revenue", label: "Revenue" },
];

export function CreateLinkForm() {
  const [state, action, pending] = useActionState<CreateLinkState, FormData>(createNumbersLink, null);

  return (
    <div className="nb-card">
      <div className="nb-card-head">New link</div>
      <form action={action} className="nb-card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input name="label" className="nb-input" placeholder="Who or what it's for, e.g. Office TV" required maxLength={80} style={{ flex: "1 1 240px" }} />
          <select name="expiry" className="nb-input" defaultValue="90" aria-label="Expires">
            <option value="7">Expires in 7 days</option>
            <option value="90">Expires in 90 days</option>
            <option value="365">Expires in 1 year</option>
            <option value="never">Never expires</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span className="nb-check" style={{ color: "var(--nb-text-tertiary)" }}>Shows:</span>
          {TABS.map((t) => (
            <label key={t.value} className="nb-check">
              <input type="checkbox" name="scopes" value={t.value} defaultChecked /> {t.label}
            </label>
          ))}
          <button type="submit" className="nb-btn" disabled={pending} style={{ marginLeft: "auto" }}>
            {pending ? "Creating…" : "Create link"}
          </button>
        </div>
        {state && !state.ok ? <p className="nb-foot" style={{ color: "var(--nb-red)", margin: 0 }}>{state.error}</p> : null}
        {state && state.ok ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Link for {state.label}: copy it now</p>
            <div className="nb-url" data-testid="new-link-url">{state.url}</div>
            <p className="nb-foot" style={{ margin: 0 }}>
              Shown once. Only a hash is stored. If you lose it, revoke it and make a new one.
            </p>
          </div>
        ) : null}
      </form>
    </div>
  );
}
