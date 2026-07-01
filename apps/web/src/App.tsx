import {
  Activity,
  Ban,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Download,
  FileSearch,
  LayoutDashboard,
  ListFilter,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { api, post } from "./api";

type Bootstrap = {
  setupRequired: boolean;
  companiesHouseConfigured: boolean;
  googlePlacesConfigured: boolean;
  productionExportsEnabled: boolean;
  liveCollectionEnabled: boolean;
  liveCollectionAvailable: boolean;
  policyVersion: string;
};

type User = {
  userId: string;
  email: string;
  organisationId: string;
  organisationName: string;
  role: string;
  organisationApproved: boolean;
};

type Campaign = {
  id: string;
  name: string;
  purpose: string;
  status: string;
  target_industry?: string;
  target_location?: string;
  max_leads?: number;
  lead_count?: number;
  created_at: string;
};

type Lead = {
  id: string;
  company_number: string;
  legal_name: string;
  company_status: string;
  company_type: string;
  registrable_domain: string;
  address: string;
  mailbox_type: string;
  outcome: "eligible" | "ineligible" | null;
  reason_codes: string[] | null;
  decided_at: string | null;
};

type Prospect = {
  id: string;
  legal_name: string;
  entity_type: string;
  company_number?: string | null;
  charity_commission_number?: string | null;
  registrable_domain?: string | null;
  mailbox?: string | null;
  address?: Record<string, unknown> | null;
  address_context?: string | null;
  channel?: string | null;
  outcome?: string | null;
  reason_codes?: string[] | null;
  decided_at?: string | null;
};

type ChannelPolicy = {
  corporateEmailEnabled: boolean;
  postalLetterEnabled: boolean;
  individualEmailEnabled: boolean;
  telephoneEnabled: boolean;
  letterTemplateApproved: boolean;
  selfPrintFulfilmentEnabled: boolean;
  providerFulfilmentEnabled: boolean;
  evidenceReference?: string;
};

type EmailDelivery = {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromName: string;
  fromEmail: string;
  replyToEmail?: string | null;
  enabled: boolean;
  passwordConfigured: boolean;
  lastTestedAt?: string | null;
  lastTestStatus?: string | null;
  lastTestMessage?: string | null;
};

const nav = [
  { path: "/", label: "Overview", icon: LayoutDashboard },
  { path: "/campaigns", label: "Campaigns", icon: Target },
  { path: "/leads", label: "Leads", icon: Building2 },
  { path: "/suppression", label: "Suppression", icon: Ban },
  { path: "/compliance", label: "Compliance", icon: ShieldCheck },
  { path: "/settings", label: "Settings", icon: Settings },
];

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const go = (next: string) => {
    history.pushState({}, "", next);
    setPath(next);
  };
  return { path, go };
}

function Button({
  children,
  onClick,
  type = "button",
  kind = "primary",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  return (
    <button className={`button ${kind}`} type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Status({ value }: { value: string | null | undefined }) {
  const normal = value ?? "unknown";
  return <span className={`status status-${normal.replaceAll("_", "-")}`}>{normal.replaceAll("_", " ")}</span>;
}

function Setup({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await post("/api/setup", Object.fromEntries(data));
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <AuthFrame title="Set up your workspace" copy="Create the first owner account for this private Lead Gen installation.">
      <form className="form-stack" onSubmit={submit}>
        <label>Organisation name<input name="organisationName" required minLength={2} /></label>
        <label>Email address<input name="email" type="email" required /></label>
        <label>Password<input name="password" type="password" required minLength={10} /></label>
        {error ? <p className="form-error">{error}</p> : null}
        <Button type="submit">Create secure workspace <ChevronRight size={16} /></Button>
      </form>
    </AuthFrame>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await post("/api/login", Object.fromEntries(data));
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <AuthFrame title="Welcome back" copy="Sign in to manage compliant corporate lead research.">
      <form className="form-stack" onSubmit={submit}>
        <label>Email address<input name="email" type="email" required /></label>
        <div className="login-password-label"><label>Password</label><span>Private owner access</span></div>
        <input name="password" type="password" required />
        {error ? <p className="form-error">{error}</p> : null}
        <Button type="submit">Sign in <ChevronRight size={16} /></Button>
      </form>
      <div className="public-links"><a href="/objection">Object to processing</a><a href="/rights">Rights request</a><a href="/complaint">Make a complaint</a></div>
    </AuthFrame>
  );
}

function AuthFrame({ title, copy, children }: { title: string; copy: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-intro">
        <div className="auth-orb auth-orb-one" />
        <div className="auth-orb auth-orb-two" />
        <div className="auth-brand-content">
          <div className="auth-logo-lockup"><img src="/leodis-mark.png" alt="" /><span>Leodis Digital</span></div>
          <div>
            <h1>Corporate lead research, without the guesswork.</h1>
            <p>Keep every source, verification and export decision moving in one focused compliance workspace.</p>
            <div className="auth-proof"><CheckCircle2 size={15} /> Quarantine by default</div>
            <div className="auth-proof"><CheckCircle2 size={15} /> Complete decision lineage</div>
            <div className="auth-proof"><CheckCircle2 size={15} /> Suppression checked before export</div>
          </div>
        </div>
        <p className="auth-brand-footer">Leodis Digital · Leeds</p>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="auth-mobile-mark"><img src="/leodis-mark.png" alt="" /><span>Leodis Digital</span></div>
          <h2>{title}</h2>
          <p>{copy}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

function Shell({ user, path, go, children, logout }: { user: User; path: string; go: (path: string) => void; children: ReactNode; logout: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="app-shell">
      <aside className={mobileOpen ? "sidebar open" : "sidebar"}>
        <div className="sidebar-brand"><div className="brand-mark"><ShieldCheck size={20} /></div><strong>Lead Gen V2</strong><button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={20} /></button></div>
        <nav>
          {nav.map((item) => {
            const active = item.path === "/" ? path === "/" : path.startsWith(item.path);
            return <button key={item.path} className={active ? "nav-item active" : "nav-item"} onClick={() => { go(item.path); setMobileOpen(false); }}><item.icon size={18} />{item.label}</button>;
          })}
        </nav>
        <div className="sidebar-foot"><div className="org-avatar">{user.organisationName.slice(0, 2).toUpperCase()}</div><div><strong>{user.organisationName}</strong><span>{user.role}</span></div><button onClick={logout} title="Log out"><LogOut size={18} /></button></div>
      </aside>
      <main className="main">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div><strong>{user.organisationName}</strong><span>Compliance workspace</span></div><div className="topbar-user">{user.email}</div></header>
        <div className="page">{children}</div>
        <footer className="app-footer">Software designed by <a href="https://leodisdigital.co.uk" target="_blank" rel="noreferrer">Leodis Digital</a>.</footer>
      </main>
    </div>
  );
}

function PageHeader({ title, copy, action }: { title: string; copy: string; action?: ReactNode }) {
  return <div className="page-header"><div><h1>{title}</h1><p>{copy}</p></div>{action}</div>;
}

function CapabilityBanner({ bootstrap }: { bootstrap: Bootstrap }) {
  return (
    <section className="capability-banner">
      <ShieldCheck size={22} />
      <div><strong>Compliance controls are active</strong><p>Companies House: {bootstrap.companiesHouseConfigured ? "configured" : "credential required"} · Eligible export: {bootstrap.productionExportsEnabled ? "enabled" : "locked pending launch gates"} · Policy {bootstrap.policyVersion}</p></div>
    </section>
  );
}

function Overview({ bootstrap, go }: { bootstrap: Bootstrap; go: (path: string) => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api("/api/dashboard").then(setData); }, []);
  if (!data) return <Loading />;
  const stats = [
    ["Eligible leads", data.stats.eligible_leads, CheckCircle2, "green"],
    ["Total assessed", data.stats.total_leads, FileSearch, "blue"],
    ["Suppressed", data.stats.suppressed, Ban, "red"],
    ["Active campaigns", data.stats.active_campaigns, Activity, "amber"],
  ];
  return (
    <>
      <PageHeader title="Overview" copy="A clear view of campaigns, eligibility, and compliance activity." action={<Button onClick={() => go("/campaigns/new")}><Plus size={16} /> New campaign</Button>} />
      <CapabilityBanner bootstrap={bootstrap} />
      <div className="stat-grid">{stats.map(([label, value, Icon, tone]) => <section className="stat" key={label as string}><div className={`stat-icon ${tone}`}><Icon size={19} /></div><span>{label as string}</span><strong>{String(value ?? 0)}</strong></section>)}</div>
      <section className="panel"><div className="panel-head"><div><h2>Recent campaigns</h2><p>Current lead volume and processing state.</p></div><button className="text-button" onClick={() => go("/campaigns")}>View all <ChevronRight size={15} /></button></div><CampaignTable campaigns={data.campaigns} go={go} /></section>
      <section className="panel"><div className="panel-head"><div><h2>Recent activity</h2><p>Append-only events recorded for this organisation.</p></div></div><div className="activity-list">{data.activity.length ? data.activity.map((item: any) => <div className="activity-row" key={`${item.subject_id}-${item.occurred_at}`}><div className="activity-dot" /><div><strong>{item.event_type.replaceAll(".", " ")}</strong><span>{item.subject_type} · {new Date(item.occurred_at).toLocaleString()}</span></div></div>) : <Empty text="No activity recorded yet." />}</div></section>
    </>
  );
}

function CampaignTable({ campaigns, go }: { campaigns: Campaign[]; go: (path: string) => void }) {
  if (!campaigns.length) return <Empty text="No campaigns yet. Create one to begin assessing corporate targets." />;
  return <div className="table-wrap"><table><thead><tr><th>Campaign</th><th>Target</th><th>Leads</th><th>Status</th><th /></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.id}><td><strong>{campaign.name}</strong><span>{new Date(campaign.created_at).toLocaleDateString()}</span></td><td>{campaign.target_industry || "Any corporate"}<span>{campaign.target_location || "United Kingdom"}</span></td><td>{campaign.lead_count ?? 0}</td><td><Status value={campaign.status} /></td><td><button className="row-action" onClick={() => go(`/campaigns/${campaign.id}`)}><ChevronRight size={17} /></button></td></tr>)}</tbody></table></div>;
}

function Campaigns({ go }: { go: (path: string) => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  useEffect(() => { api<Campaign[]>("/api/campaigns").then(setCampaigns); }, []);
  return <><PageHeader title="Campaigns" copy="Define a purpose, principal, and approved corporate target set." action={<Button onClick={() => go("/campaigns/new")}><Plus size={16} /> New campaign</Button>} /><section className="panel">{campaigns ? <CampaignTable campaigns={campaigns} go={go} /> : <Loading />}</section></>;
}

function NewCampaign({ go, user }: { go: (path: string) => void; user: User }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await post<{ id: string }>("/api/campaigns", Object.fromEntries(form));
      go(`/campaigns/${result.id}`);
    } catch (err) { setError((err as Error).message); }
  }
  return <><PageHeader title="Create campaign" copy="Record the represented business, purpose, and targeting boundaries before adding leads." /><form className="panel form-grid" onSubmit={submit}><div className="form-section"><h2>Campaign</h2><label>Campaign name<input name="name" required placeholder="Yorkshire facilities outreach" /></label><label className="wide">Purpose<textarea name="purpose" required minLength={10} placeholder="Offer emergency drainage support to relevant corporate property managers." /></label><label>Target industry<input name="targetIndustry" placeholder="Property management" /></label><label>Target location<input name="targetLocation" placeholder="West Yorkshire" /></label><label>Maximum leads<input name="maxLeads" type="number" min="1" max="10000" defaultValue="100" /></label></div><div className="form-section"><h2>Campaign principal</h2><p>The organisation represented by this outreach.</p><label>Legal name<input name="principalLegalName" required defaultValue={user.organisationName} /></label><label>Company number<input name="principalCompanyNumber" required placeholder="01234567" /></label><label>Intended sender<input name="intendedSender" type="email" required defaultValue={user.email} /></label></div><label className="attestation"><input type="checkbox" required /> I confirm this campaign is relevant corporate B2B outreach and all objections will be honoured.</label>{error ? <p className="form-error">{error}</p> : null}<div className="form-actions"><Button kind="secondary" onClick={() => go("/campaigns")}>Cancel</Button><Button type="submit">Create campaign <ChevronRight size={16} /></Button></div></form></>;
}

function CampaignDetail({ id, bootstrap, user }: { id: string; bootstrap: Bootstrap; user: User }) {
  const [data, setData] = useState<{ campaign: Campaign; leads: Lead[] } | null>(null);
  const [prospects, setProspects] = useState<Prospect[] | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    const [campaignData, prospectRows] = await Promise.all([
      api<{ campaign: Campaign; leads: Lead[] }>(`/api/campaigns/${id}`),
      api<Prospect[]>(`/api/campaigns/${id}/prospects`).catch(() => []),
    ]);
    setData(campaignData);
    setProspects(prospectRows);
  };
  useEffect(() => { load(); }, [id]);
  async function addTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = { ...Object.fromEntries(data), domainConfirmed: data.get("domainConfirmed") === "on" };
    try { await post(`/api/campaigns/${id}/targets`, input); form.reset(); await load(); } catch (err) { setError((err as Error).message); }
  }
  async function addProspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const postalLine1 = String(formData.get("postalLine1") ?? "").trim();
    const postalTown = String(formData.get("postalTown") ?? "").trim();
    const postalPostcode = String(formData.get("postalPostcode") ?? "").trim();
    const postalAddress = postalLine1 || postalTown || postalPostcode
      ? { line1: postalLine1, town: postalTown, postcode: postalPostcode }
      : undefined;
    try {
      await post(`/api/campaigns/${id}/prospects`, {
        entityType: formData.get("entityType"),
        legalName: formData.get("legalName"),
        tradingName: formData.get("tradingName"),
        companyNumber: formData.get("companyNumber"),
        charityCommissionNumber: formData.get("charityCommissionNumber"),
        oscrNumber: formData.get("oscrNumber"),
        domain: formData.get("domain"),
        mailbox: formData.get("mailbox"),
        channel: formData.get("channel"),
        lawfulBasisRecorded: formData.get("lawfulBasisRecorded") === "on",
        transparencyRecorded: formData.get("transparencyRecorded") === "on",
        consentRecorded: formData.get("consentRecorded") === "on",
        postalAddress,
        addressContext: formData.get("addressContext"),
        publicContextApproved: formData.get("publicContextApproved") === "on",
        addressSourceApproved: formData.get("addressSourceApproved") === "on",
        sensitiveTargetingRisk: formData.get("sensitiveTargetingRisk") === "on",
      });
      form.reset();
      await load();
    } catch (err) { setError((err as Error).message); }
  }
  async function suppress(leadId: string) { await post(`/api/leads/${leadId}/suppress`, {}); await load(); }
  async function approve() {
    setError("");
    try { await post(`/api/campaigns/${id}/approve`, {}); await load(); } catch (err) { setError((err as Error).message); }
  }
  async function discoverGoogle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      await post(`/api/campaigns/${id}/discover-google`, {
        query: formData.get("query"),
        location: formData.get("location"),
        maxResults: Number(formData.get("maxResults")),
        lawfulBasisRecorded: formData.get("lawfulBasisRecorded") === "on",
        transparencyRecorded: formData.get("transparencyRecorded") === "on",
        addressSourceApproved: formData.get("addressSourceApproved") === "on",
        publicContextApproved: formData.get("publicContextApproved") === "on",
        discoverWebsiteMailboxes: formData.get("discoverWebsiteMailboxes") === "on",
      });
      form.reset();
      await load();
    } catch (err) { setError((err as Error).message); }
  }
  if (!data) return <Loading />;
  const eligible = data.leads.filter((lead) => lead.outcome === "eligible").length;
  const prospectEligible = prospects?.filter((prospect) => prospect.outcome === "eligible").length ?? 0;
  const action = data.campaign.status === "pending_approval" && user.role === "owner"
    ? <Button onClick={approve}><ClipboardCheck size={16} /> Verify and approve</Button>
    : <div className="export-actions"><a className={`button secondary ${bootstrap.productionExportsEnabled ? "" : "disabled"}`} href={`/api/campaigns/${id}/export-email.csv`}><Download size={16} /> Email CSV</a><a className={`button secondary ${bootstrap.productionExportsEnabled ? "" : "disabled"}`} href={`/api/campaigns/${id}/export-letters.csv`}><Download size={16} /> Letter CSV</a><a className="button secondary" href={`/api/campaigns/${id}/review-quarantine.csv`}><Download size={16} /> Quarantine</a></div>;
  return <><PageHeader title={data.campaign.name} copy={data.campaign.purpose} action={action} /><div className="mini-stats"><span><strong>{data.leads.length + (prospects?.length ?? 0)}</strong> assessed</span><span><strong>{eligible + prospectEligible}</strong> eligible</span><span><strong>{(prospects?.filter((item) => item.outcome === "held").length ?? 0)}</strong> held</span></div><CampaignPreviewPanel campaignId={id} /><section className="panel"><div className="panel-head"><div><h2>Google discovery</h2><p>Find organisations by category and location, verify companies where possible, then route to email or post.</p></div><Status value={bootstrap.googlePlacesConfigured ? "configured" : "key required"} /></div><form className="prospect-form" onSubmit={discoverGoogle}><label>Search<input name="query" required defaultValue={data.campaign.target_industry ?? ""} placeholder="charities, electricians, plumbers" /></label><label>Location<input name="location" defaultValue={data.campaign.target_location ?? ""} placeholder="Leeds" /></label><label>Maximum results<input name="maxResults" type="number" min="1" max="20" defaultValue="10" /></label><label className="checkbox-label"><input name="lawfulBasisRecorded" type="checkbox" /> Lawful basis recorded</label><label className="checkbox-label"><input name="transparencyRecorded" type="checkbox" /> Transparency recorded</label><label className="checkbox-label"><input name="addressSourceApproved" type="checkbox" /> Address source approved</label><label className="checkbox-label"><input name="publicContextApproved" type="checkbox" /> Public context approved</label><label className="checkbox-label"><input name="discoverWebsiteMailboxes" type="checkbox" defaultChecked /> Find role emails on websites</label>{error ? <p className="form-error">{error}</p> : null}<Button type="submit"><Search size={16} /> Discover leads</Button></form></section><section className="panel"><div className="panel-head"><div><h2>Add Buttercup prospect</h2><p>Assess organisations or people into email, letter, consent-required, held, or quarantine channels.</p></div></div><form className="prospect-form" onSubmit={addProspect}><label>Entity type<select name="entityType" defaultValue="uk_limited_company"><option value="uk_limited_company">UK limited company</option><option value="uk_llp">UK LLP</option><option value="registered_charity">Registered charity</option><option value="charitable_company">Charitable company</option><option value="sole_trader">Sole trader</option><option value="individual">Individual</option><option value="unsupported">Unsupported</option></select></label><label>Channel<select name="channel" defaultValue="corporate_email"><option value="corporate_email">Corporate email</option><option value="postal_letter">Postal letter</option><option value="individual_email">Individual email</option></select></label><label>Legal name<input name="legalName" required placeholder="Example Community Ltd" /></label><label>Trading name<input name="tradingName" placeholder="Optional" /></label><label>Company number<input name="companyNumber" placeholder="01234567" /></label><label>Charity number<input name="charityCommissionNumber" placeholder="1128027" /></label><label>OSCR number<input name="oscrNumber" placeholder="SC042679" /></label><label>Domain<input name="domain" placeholder="example.org.uk" /></label><label>Mailbox<input name="mailbox" type="email" placeholder="info@example.org.uk" /></label><label>Address line<input name="postalLine1" placeholder="1 High Street" /></label><label>Town<input name="postalTown" placeholder="Leeds" /></label><label>Postcode<input name="postalPostcode" placeholder="LS1 1AA" /></label><label>Address context<select name="addressContext" defaultValue="unknown"><option value="business">Business</option><option value="registered_office">Registered office</option><option value="likely_home">Likely home</option><option value="unknown">Unknown</option></select></label><label className="checkbox-label"><input name="lawfulBasisRecorded" type="checkbox" /> Lawful basis recorded</label><label className="checkbox-label"><input name="transparencyRecorded" type="checkbox" /> Transparency recorded</label><label className="checkbox-label"><input name="addressSourceApproved" type="checkbox" /> Address source approved</label><label className="checkbox-label"><input name="publicContextApproved" type="checkbox" /> Public context approved</label><label className="checkbox-label"><input name="consentRecorded" type="checkbox" /> Consent recorded</label><label className="checkbox-label"><input name="sensitiveTargetingRisk" type="checkbox" /> Sensitive targeting risk</label>{error ? <p className="form-error">{error}</p> : null}<Button type="submit"><Plus size={16} /> Assess prospect</Button></form></section><section className="panel"><div className="panel-head"><div><h2>Prospect channel decisions</h2><p>Current Buttercup outreach decision by channel.</p></div></div>{prospects ? <ProspectTable prospects={prospects} /> : <Loading />}</section><section className="panel"><div className="panel-head"><div><h2>Legacy lead assessments</h2><p>Existing company/mailbox records retained during migration.</p></div></div><LeadTable leads={data.leads} suppress={suppress} /></section></>;
}

function CampaignPreviewPanel({ campaignId }: { campaignId: string }) {
  const [mode, setMode] = useState<"email" | "letter">("email");
  const [preview, setPreview] = useState<RenderPreview | null>(null);
  const [error, setError] = useState("");
  const [sendStatus, setSendStatus] = useState("");
  async function load(nextMode = mode) {
    setError("");
    setPreview(null);
    try {
      setPreview(await api<RenderPreview>(`/api/campaigns/${campaignId}/${nextMode}-preview?limit=5`));
    } catch (err) {
      setError((err as Error).message);
    }
  }
  useEffect(() => { load(mode); }, [campaignId, mode]);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSendStatus("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await post<{ attempted: number; sent: number; failed: number }>("/api/campaigns/" + campaignId + "/send-email", {
        confirmation: data.get("confirmation"),
        limit: Number(data.get("limit") || 100),
      });
      setSendStatus(`Attempted ${result.attempted}; sent ${result.sent}; failed ${result.failed}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return <section className="panel preview-panel"><div className="panel-head"><div><h2>Message preview</h2><p>Rendered copy for currently eligible prospects using approved templates.</p></div><div className="segmented"><button className={mode === "email" ? "active" : ""} onClick={() => setMode("email")}>Email</button><button className={mode === "letter" ? "active" : ""} onClick={() => setMode("letter")}>Letter</button></div></div>{error ? <p className="form-error">{error}</p> : null}{!error && !preview ? <Loading /> : null}{!error && preview?.items.length ? <div className="preview-list">{preview.items.map((item) => <article className="message-preview" key={item.campaignProspectId}><header><strong>{item.organisationName}</strong><span>{mode === "email" ? item.recipient : item.addressLines?.join(", ")}</span></header>{mode === "email" ? <h3>{item.subject}</h3> : <h3>{item.heading || "Postal letter"}</h3>}<pre>{item.body}</pre>{item.doNotContactCode ? <footer>Code: {item.doNotContactCode}</footer> : null}</article>)}</div> : null}{!error && preview && !preview.items.length ? <Empty text={`No eligible ${mode === "email" ? "email" : "letter"} recipients to preview.`} /> : null}{mode === "email" ? <form className="inline-target-form send-confirm-form" onSubmit={send}><label>Maximum sends<input name="limit" type="number" min="1" max="500" defaultValue="100" /></label><label>Confirmation<input name="confirmation" placeholder="SEND APPROVED EMAILS" /></label><Button type="submit">Send approved emails</Button>{sendStatus ? <p className="form-success">{sendStatus}</p> : null}</form> : null}</section>;
}

function ProspectTable({ prospects }: { prospects: Prospect[] }) {
  if (!prospects.length) return <Empty text="No prospects assessed yet." />;
  return <div className="table-wrap"><table><thead><tr><th>Prospect</th><th>Channel</th><th>Contact evidence</th><th>Decision</th><th>Reasons</th></tr></thead><tbody>{prospects.map((prospect) => <tr key={prospect.id}><td><strong>{prospect.legal_name}</strong><span>{prospect.entity_type.replaceAll("_", " ")} · {prospect.company_number || prospect.charity_commission_number || "unregistered"}</span></td><td>{prospect.channel?.replaceAll("_", " ") ?? "not assessed"}</td><td>{prospect.mailbox || prospect.registrable_domain || prospect.address_context || "No contact route"}<span>{prospect.registrable_domain}</span></td><td><Status value={prospect.outcome ?? "pending"} /></td><td className="reason-cell">{prospect.reason_codes?.length ? prospect.reason_codes.map((reason) => <span key={reason}>{reason.replaceAll("_", " ").toLowerCase()}</span>) : <span className="clear">All checks passed</span>}</td></tr>)}</tbody></table></div>;
}

function LeadTable({ leads, suppress }: { leads: Lead[]; suppress?: (id: string) => void }) {
  if (!leads.length) return <Empty text="No leads assessed yet." />;
  return <div className="table-wrap"><table><thead><tr><th>Company</th><th>Role mailbox</th><th>Company status</th><th>Decision</th><th>Reasons</th><th /></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><strong>{lead.legal_name}</strong><span>{lead.company_number} · {lead.registrable_domain}</span></td><td>{lead.address}<span>{lead.mailbox_type.replaceAll("_", " ")}</span></td><td><Status value={lead.company_status} /></td><td><Status value={lead.outcome ?? "pending"} /></td><td className="reason-cell">{lead.reason_codes?.length ? lead.reason_codes.map((reason) => <span key={reason}>{reason.replaceAll("_", " ").toLowerCase()}</span>) : <span className="clear">All checks passed</span>}</td><td>{suppress ? <button className="row-action danger-icon" title="Suppress mailbox" onClick={() => suppress(lead.id)}><Ban size={16} /></button> : null}</td></tr>)}</tbody></table></div>;
}

function AllLeads({ campaigns, go }: { campaigns: Campaign[]; go: (path: string) => void }) {
  return <><PageHeader title="Leads" copy="Review leads within their campaign context and current compliance decision." /><section className="panel"><CampaignTable campaigns={campaigns} go={go} /></section></>;
}

function Suppression() {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { api<any[]>("/api/suppressions").then(setItems); }, []);
  return <><PageHeader title="Suppression" copy="Active objections and exclusions checked before any eligible export." /><section className="panel">{!items ? <Loading /> : items.length ? <div className="table-wrap"><table><thead><tr><th>Scope</th><th>Target</th><th>Reason</th><th>Suppressed</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.scope}</td><td>{item.target_type}</td><td>{item.reason.replaceAll("_", " ")}</td><td>{new Date(item.suppressed_at).toLocaleString()}</td><td><Status value={item.active ? "active" : "inactive"} /></td></tr>)}</tbody></table></div> : <Empty text="No suppression entries recorded." />}</section></>;
}

function Compliance({ bootstrap }: { bootstrap: Bootstrap }) {
  const [data, setData] = useState<any>(null);
  const load = () => api("/api/compliance").then(setData);
  useEffect(() => { load(); }, []);
  async function update(kind: "rights" | "complaints", id: string, status: string) { await post(`/api/compliance/${kind}/${id}/status`, { status }); await load(); }
  async function decideReview(id: string, input: unknown) { await post(`/api/reviews/${id}/decide`, input); await load(); }
  async function jobAction(id: string, action: "cancel" | "retry") { await post(`/api/admin/jobs/${id}/${action}`, {}); await load(); }
  return <><PageHeader title="Compliance" copy="Launch controls, deterministic reviews, rights operations, and job health." /><div className="compliance-grid"><section className="panel"><h2>Launch controls</h2><div className="control-list"><Control label="Companies House verification" ok={bootstrap.companiesHouseConfigured} detail={bootstrap.companiesHouseConfigured ? "Credential configured" : "API key required"} /><Control label="Production eligible exports" ok={bootstrap.productionExportsEnabled} detail={bootstrap.productionExportsEnabled ? "Enabled" : "Locked pending launch gates"} /><Control label="Live source collection" ok={bootstrap.liveCollectionEnabled} detail={bootstrap.liveCollectionAvailable ? (bootstrap.liveCollectionEnabled ? "Enabled" : "Disabled") : "Unavailable in this milestone"} /><Control label="Policy version" ok detail={bootstrap.policyVersion} /></div></section><section className="panel"><h2>Mandatory operating posture</h2><ul className="policy-list"><li><CheckCircle2 size={17} />Corporate entities only</li><li><CheckCircle2 size={17} />Role mailboxes only</li><li><CheckCircle2 size={17} />Suppression before export</li><li><CheckCircle2 size={17} />No LLM eligibility approvals</li></ul></section></div>{!data ? <Loading /> : <><ReviewQueue items={data.reviews} decide={decideReview} /><div className="compliance-grid"><ComplianceQueue title="Rights requests" items={data.rights} dueKey="due_at" update={(id, status) => update("rights", id, status)} /><ComplianceQueue title="Complaints" items={data.complaints} dueKey="acknowledgement_due_at" update={(id, status) => update("complaints", id, status)} /></div><div className="compliance-grid"><PreferenceImportPanel /><DsarSearchPanel /></div><JobQueue items={data.jobs} action={jobAction} /><section className="panel"><div className="panel-head"><div><h2>Audit trail</h2><p>Recent compliance and user actions.</p></div></div><div className="activity-list">{data.audits.length ? data.audits.map((item: any) => <div className="activity-row" key={`${item.subject_id}-${item.occurred_at}`}><div className="activity-dot" /><div><strong>{item.event_type.replaceAll(".", " ")}</strong><span>{item.subject_type} · {new Date(item.occurred_at).toLocaleString()}</span></div></div>) : <Empty text="No audit events yet." />}</div></section></>}</>;
}

function ComplianceQueue({ title, items, dueKey, update }: { title: string; items: any[]; dueKey: string; update: (id: string, status: string) => void }) {
  return <section className="panel"><div className="panel-head"><div><h2>{title}</h2><p>{items.length} recent records</p></div></div>{items.length ? <div className="queue-list">{items.map((item) => <div className="queue-row" key={item.id}><div><strong>{item.request_type?.replaceAll("_", " ") ?? title.slice(0, -1)}</strong><span>Due {new Date(item[dueKey]).toLocaleDateString()}</span></div><Status value={item.status} /><div className="queue-actions"><button onClick={() => update(item.id, "acknowledged")}>Acknowledge</button><button onClick={() => update(item.id, "completed")}>Complete</button></div></div>)}</div> : <Empty text={`No ${title.toLowerCase()} received.`} />}</section>;
}

function ReviewQueue({ items, decide }: { items: any[]; decide: (id: string, input: unknown) => void }) {
  const pending = items.filter((item) => item.status === "pending");
  async function submit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const checked = (name: string) => form.get(name) === "on";
    await decide(id, {
      listing: {
        exactCompanyNumberOnPage: checked("exactCompanyNumberOnPage"),
        legalNameOnPage: checked("legalNameOnPage"),
        conflictingCompanyNumber: checked("listingConflictingCompanyNumber"),
        negativeContext: checked("negativeContext"),
      },
      domain: {
        linkedFromApprovedSource: checked("linkedFromApprovedSource"),
        exactCompanyNumberOnSite: checked("exactCompanyNumberOnSite"),
        legalNameOnSite: checked("legalNameOnSite"),
        sharedOrMarketplaceDomain: checked("sharedOrMarketplaceDomain"),
        parkedDomain: checked("parkedDomain"),
        conflictingCompanyNumber: checked("domainConflictingCompanyNumber"),
      },
    });
  }
  return <section className="panel"><div className="panel-head"><div><h2>Deterministic review queue</h2><p>Approval is calculated from recorded evidence, not reviewer discretion.</p></div><Status value={pending.length ? "pending" : "complete"} /></div>{pending.length ? <div className="review-list">{pending.map((item) => <details className="review-item" key={item.id}><summary><div><strong>{item.legal_name ?? "Lead verification"}</strong><span>{item.company_number} · {item.registrable_domain} · {item.address}</span></div><ChevronRight size={17} /></summary><form className="review-evidence" onSubmit={(event) => submit(event, item.id)}><fieldset><legend>Listing evidence</legend><label><input type="checkbox" name="exactCompanyNumberOnPage" /> Exact company number appears in relevant page context</label><label><input type="checkbox" name="legalNameOnPage" /> Legal name appears in relevant page context</label><label><input type="checkbox" name="listingConflictingCompanyNumber" /> Conflicting company number found</label><label><input type="checkbox" name="negativeContext" /> Evidence is footer credit, testimonial, or unrelated context</label></fieldset><fieldset><legend>Domain evidence</legend><label><input type="checkbox" name="linkedFromApprovedSource" /> Domain linked from an approved authoritative source</label><label><input type="checkbox" name="exactCompanyNumberOnSite" /> Exact company number appears on site</label><label><input type="checkbox" name="legalNameOnSite" /> Legal name appears on site</label><label><input type="checkbox" name="sharedOrMarketplaceDomain" /> Shared, franchise, or marketplace domain</label><label><input type="checkbox" name="parkedDomain" /> Parked domain</label><label><input type="checkbox" name="domainConflictingCompanyNumber" /> Conflicting company number found</label></fieldset><div className="form-actions"><Button type="submit">Record deterministic decision</Button></div></form></details>)}</div> : <Empty text="No deterministic reviews pending." />}</section>;
}

function JobQueue({ items, action }: { items: any[]; action: (id: string, action: "cancel" | "retry") => void }) {
  return <section className="panel"><div className="panel-head"><div><h2>Job operations</h2><p>Idempotent queue records, retries, cancellation, and dead-letter state.</p></div></div>{items.length ? <div className="job-list">{items.map((item) => <div className="job-row" key={item.id}><div><strong>{item.job_name.replaceAll("_", " ")}</strong><span>{item.queue_name} · attempt {item.attempts}/{item.max_attempts}</span></div><Status value={item.status} /><div className="queue-actions">{["queued", "retry_scheduled", "running"].includes(item.status) ? <button onClick={() => action(item.id, "cancel")}>Cancel</button> : null}{["cancelled", "dead_letter"].includes(item.status) ? <button onClick={() => action(item.id, "retry")}>Retry</button> : null}</div></div>)}</div> : <Empty text="No jobs recorded." />}</section>;
}

function PreferenceImportPanel() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const data = new FormData(event.currentTarget);
    const identifiers = String(data.get("identifiers") ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    try {
      const result = await post<{ imported: number }>("/api/settings/preference-checks/import", {
        service: data.get("service"),
        targetType: data.get("targetType"),
        identifiers,
        evidenceReference: data.get("evidenceReference"),
        expiresAt: data.get("expiresAt"),
      });
      event.currentTarget.reset();
      setMessage(`Imported ${result.imported} preference checks.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return <section className="panel"><div className="panel-head"><div><h2>Preference import</h2><p>Import FPS, MPS, internal, or other preference matches as active blocks.</p></div></div><form className="form-grid compact-form" onSubmit={submit}><label>Service<select name="service" defaultValue="fps"><option value="fps">FPS</option><option value="mps">MPS</option><option value="internal">Internal</option><option value="other">Other</option></select></label><label>Target type<select name="targetType" defaultValue="person"><option value="person">Person</option><option value="postal_address">Postal address</option><option value="mailbox">Mailbox</option><option value="company">Company</option><option value="charity">Charity</option><option value="domain">Domain</option></select></label><label>Expires<input name="expiresAt" type="date" required /></label><label className="wide">Evidence reference<input name="evidenceReference" required placeholder="FPS import or MPS screening reference" /></label><label className="wide">Identifiers<textarea name="identifiers" required placeholder={"One identifier per line"} /></label>{error ? <p className="form-error">{error}</p> : null}{message ? <p className="form-success">{message}</p> : null}<div className="form-actions"><Button type="submit">Import preferences</Button></div></form></section>;
}

function DsarSearchPanel() {
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const identifier = new FormData(event.currentTarget).get("identifier");
    try {
      setResult(await api(`/api/admin/dsar-search?identifier=${encodeURIComponent(String(identifier ?? ""))}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }
  const counts = result ? [
    ["Prospects", result.prospects?.length ?? 0],
    ["Decisions", result.decisions?.length ?? 0],
    ["Suppressions", result.suppressions?.length ?? 0],
    ["Tokens", result.doNotContactTokens?.length ?? 0],
    ["Rights", result.rights?.length ?? 0],
  ] : [];
  return <section className="panel"><div className="panel-head"><div><h2>DSAR search</h2><p>Admin search across prospect records, decisions, suppressions, tokens, audits, rights, and complaints.</p></div></div><form className="inline-target-form" onSubmit={submit}><label>Identifier<input name="identifier" required placeholder="Name, email, address, company, charity number" /></label>{error ? <p className="form-error">{error}</p> : null}<Button type="submit"><Search size={16} /> Search</Button></form>{result ? <div className="dsar-result"><div className="mini-stats">{counts.map(([label, count]) => <span key={label as string}><strong>{count}</strong> {label}</span>)}</div><pre>{JSON.stringify(result, null, 2)}</pre></div> : null}</section>;
}

function PublicRequestPage({ mode }: { mode: "objection" | "rights" | "complaint" }) {
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const titles = { objection: "Object to processing", rights: "Submit a rights request", complaint: "Make a complaint" };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const path = mode === "objection" ? "/api/public/objections" : mode === "rights" ? "/api/public/rights-requests" : "/api/public/complaints";
    try { const result = await post<{ reference?: string }>(path, data); setSuccess(result.reference ? `Request received. Reference: ${result.reference}` : "Your objection has been recorded."); form.reset(); } catch (err) { setError((err as Error).message); }
  }
  return <main className="public-request-page"><section className="public-request-card"><div className="auth-mobile-mark public-mark"><img src="/leodis-mark.png" alt="" /><span>Leodis Digital</span></div><a href="/" className="back-link">← Back to sign in</a><h1>{titles[mode]}</h1><p>Use the identifier associated with the record or contact. Identifiers are minimised before storage.</p>{success ? <p className="form-success">{success}</p> : <form className="form-stack" onSubmit={submit}>{mode === "rights" ? <label>Request type<select name="requestType" required><option value="access">Access</option><option value="correction">Correction</option><option value="restriction">Restriction</option><option value="objection">Objection</option><option value="erasure">Erasure</option></select></label> : null}<label>{mode === "objection" ? "Email address" : "Email or relevant identifier"}<input name="identifier" type={mode === "objection" ? "email" : "text"} required minLength={3} /></label>{mode !== "objection" ? <label>Request details<textarea name="details" required minLength={10} maxLength={4000} /></label> : null}{error ? <p className="form-error">{error}</p> : null}<Button type="submit">Submit securely</Button></form>}</section></main>;
}

function DoNotContactPage() {
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await post("/api/public/do-not-contact/confirm", data);
      setSuccess("Do Not Contact confirmed.");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return <main className="public-request-page"><section className="public-request-card"><div className="auth-mobile-mark public-mark"><img src="/leodis-mark.png" alt="" /><span>Buttercup Lead Gen</span></div><a href="/" className="back-link">← Back to sign in</a><h1>Do Not Contact</h1><p>Confirm a token, printed code, or identifier to suppress future fundraising contact where applicable.</p>{success ? <p className="form-success">{success}</p> : <form className="form-stack" onSubmit={submit}><label>Token<input name="token" defaultValue={token} /></label><label>Printed code<input name="code" /></label><label>Email or identifier<input name="identifier" /></label>{error ? <p className="form-error">{error}</p> : null}<Button type="submit">Confirm Do Not Contact</Button></form>}</section></main>;
}

function AccountSettings({ user }: { user: User }) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const form = event.currentTarget;
    try {
      await post("/api/account/password", Object.fromEntries(new FormData(form)));
      form.reset();
      setSuccess("Password updated. Other signed-in sessions have been logged out.");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <div><h2>Account</h2><p>Signed in as {user.email}</p></div>
      </div>
      <form className="form-stack" onSubmit={submit}>
        <label>Current password<input name="currentPassword" type="password" required autoComplete="current-password" /></label>
        <label>New password<input name="newPassword" type="password" required minLength={10} maxLength={200} autoComplete="new-password" /></label>
        <label>Confirm new password<input name="confirmPassword" type="password" required minLength={10} maxLength={200} autoComplete="new-password" /></label>
        <p className="form-help">Use at least 10 characters. Changing your password logs out other sessions.</p>
        {error ? <p className="form-error">{error}</p> : null}
        {success ? <p className="form-success">{success}</p> : null}
        <div className="form-actions"><Button type="submit">Change password</Button></div>
      </form>
    </section>
  );
}

type Configuration = {
  companiesHouseConfigured: boolean;
  googlePlacesConfigured: boolean;
  productionExportsEnabled: boolean;
  liveCollectionEnabled: boolean;
  liveCollectionAvailable: boolean;
  clientTargetIntakeEnabled: boolean;
  charityPrincipal?: {
    status: string;
    legal_name: string;
    verification_expires_at?: string | null;
  } | null;
  channelPolicy?: ChannelPolicy;
  emailDelivery?: EmailDelivery | null;
};

type LaunchGate = {
  key: string;
  label: string;
  description: string;
  completed: boolean;
  evidence_reference?: string;
};

type SourcePolicyRow = {
  id: string;
  source_class: string;
  hostname_pattern: string | null;
  owner: string;
  evidence_reference: string | null;
  enabled: boolean;
  approved_fields: string[];
  approved_channels?: string[];
  retention_days?: number;
  rate_limit: number | null;
  volume_limit: number | null;
  expires_at: string;
};

type LetterTemplateRow = {
  id: string;
  version: string;
  name: string;
  subject_line?: string | null;
  body_text: string;
  merge_fields: string[];
  approved: boolean;
  evidence_reference: string;
  expires_at: string;
};

type EmailTemplateRow = LetterTemplateRow & {
  subject_line: string;
};

type RenderPreview = {
  template: {
    id: string;
    name: string;
    controllerIdentity: string;
  };
  count: number;
  items: Array<{
    campaignProspectId: string;
    recipient?: string | null;
    organisationName: string;
    subject?: string | null;
    heading?: string | null;
    addressLines?: string[];
    body: string;
    doNotContactCode?: string;
  }>;
};

function SourceRegistry() {
  const [items, setItems] = useState<SourcePolicyRow[] | null>(null);
  const [error, setError] = useState("");
  const load = () => api<SourcePolicyRow[]>("/api/settings/source-policies").then(setItems);
  useEffect(() => { load(); }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await post("/api/settings/source-policies", {
        sourceClass: data.get("sourceClass"),
        hostnamePattern: data.get("hostnamePattern"),
        owner: data.get("owner"),
        evidenceReference: data.get("evidenceReference"),
        approvedUses: data.getAll("approvedUses"),
        approvedFields: data.getAll("approvedFields"),
        approvedChannels: data.getAll("approvedChannels"),
        retentionDays: Number(data.get("retentionDays")),
        attributionRequired: data.get("attributionRequired") === "on",
        prohibitedReuse: String(data.get("prohibitedReuse") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        notes: data.get("notes"),
        rateLimit: Number(data.get("rateLimit")),
        volumeLimit: Number(data.get("volumeLimit")),
        expiresAt: data.get("expiresAt"),
      });
      form.reset();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function disable(id: string) {
    await post(`/api/settings/source-policies/${id}/disable`, {});
    await load();
  }
  return (
    <section className="panel settings-panel source-registry">
      <div className="panel-head"><div><h2>Approved source registry</h2><p>Every external source requires a named owner, approval evidence, limits, and expiry.</p></div><Status value={items?.some((item) => item.enabled) ? "active" : "disabled"} /></div>
      <form className="form-grid compact-form" onSubmit={create}>
        <label>Source class<select name="sourceClass"><option value="client-provided-prospect">Client-provided prospect</option><option value="google-places">Google Places</option><option value="google-search">Google Search</option><option value="company-website">Company website</option><option value="charity-website">Charity website</option><option value="companies-house">Companies House</option><option value="charity-commission">Charity Commission</option><option value="oscr">OSCR</option><option value="licensed-provider">Licensed provider</option><option value="preference-service">Preference service</option><option value="suppression-import">Suppression import</option></select></label>
        <label>Hostname pattern<input name="hostnamePattern" placeholder="*.example.co.uk or blank" /></label>
        <label>Policy owner<input name="owner" required placeholder="Compliance owner" /></label>
        <label>Approval evidence<input name="evidenceReference" required placeholder="Terms review or contract reference" /></label>
        <label>Requests per window<input name="rateLimit" type="number" min="1" defaultValue="10" required /></label>
        <label>Maximum records<input name="volumeLimit" type="number" min="1" defaultValue="1000" required /></label>
        <label>Retention days<input name="retentionDays" type="number" min="1" max="3650" defaultValue="365" required /></label>
        <label>Expires<input name="expiresAt" type="date" required /></label>
        <label className="wide">Prohibited reuse<input name="prohibitedReuse" placeholder="Comma-separated restrictions" /></label>
        <label className="checkbox-label"><input name="attributionRequired" type="checkbox" defaultChecked /> Attribution required</label>
        <fieldset><legend>Approved uses</legend>{["verification", "campaign_targeting", "corporate_email", "postal_fundraising", "preference_screening", "suppression"].map((use) => <label key={use}><input type="checkbox" name="approvedUses" value={use} /> {use.replaceAll("_", " ")}</label>)}</fieldset>
        <fieldset><legend>Approved channels</legend>{["corporate_email", "postal_letter", "individual_email", "telephone"].map((channel) => <label key={channel}><input type="checkbox" name="approvedChannels" value={channel} /> {channel.replaceAll("_", " ")}</label>)}</fieldset>
        <fieldset className="wide"><legend>Approved fields</legend>{["company_number", "company_name", "charity_number", "oscr_number", "domain", "role_mailbox", "named_mailbox", "registered_address", "postal_address", "person_name", "phone"].map((field) => <label key={field}><input type="checkbox" name="approvedFields" value={field} /> {field.replaceAll("_", " ")}</label>)}</fieldset>
        <label className="wide">Notes<input name="notes" placeholder="Policy notes" /></label>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="form-actions"><Button type="submit">Add approved source</Button></div>
      </form>
      {!items ? <Loading /> : items.length ? <div className="table-wrap"><table><thead><tr><th>Source</th><th>Owner / evidence</th><th>Channels</th><th>Limits</th><th>Expiry</th><th>Status</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.hostname_pattern ?? item.source_class}</strong><span>{item.source_class} · {item.approved_fields.join(", ")}</span></td><td>{item.owner}<span>{item.evidence_reference ?? "No evidence reference"}</span></td><td>{item.approved_channels?.join(", ") || "none"}<span>{item.retention_days ?? 365} days</span></td><td>{item.rate_limit ?? "—"} requests<span>{item.volume_limit ?? "—"} records</span></td><td>{new Date(item.expires_at).toLocaleDateString()}</td><td><Status value={item.enabled ? "enabled" : "disabled"} /></td><td>{item.enabled ? <button className="text-button" onClick={() => disable(item.id)}>Disable</button> : null}</td></tr>)}</tbody></table></div> : <Empty text="No source policies recorded." />}
    </section>
  );
}

function EmailDeliverySettings({ configuration, reload }: { configuration: Configuration; reload: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const delivery = configuration.emailDelivery;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const data = new FormData(event.currentTarget);
    try {
      await post("/api/settings/email-delivery", {
        label: data.get("label"),
        host: data.get("host"),
        port: Number(data.get("port")),
        secure: data.get("secure") === "on",
        username: data.get("username"),
        password: data.get("password"),
        fromName: data.get("fromName"),
        fromEmail: data.get("fromEmail"),
        replyToEmail: data.get("replyToEmail"),
        enabled: data.get("enabled") === "on",
      });
      await reload();
      setSuccess("Email delivery settings saved.");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function test(form: HTMLFormElement) {
    setError("");
    setSuccess("");
    try {
      const result = await post<{ status: string; message: string }>("/api/settings/email-delivery/test", {
        recipient: new FormData(form).get("testRecipient"),
      });
      await reload();
      setSuccess(result.message || `SMTP ${result.status}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return <section className="panel settings-panel"><div className="panel-head"><div><h2>Buttercup email sending</h2><p>SMTP profile for sending approved campaign email on behalf of Buttercup.</p></div><Status value={delivery?.enabled ? "enabled" : delivery?.passwordConfigured ? "configured" : "not configured"} /></div><form className="form-grid compact-form" onSubmit={save}><label>Profile name<input name="label" required defaultValue={delivery?.label ?? "Buttercup JustHost SMTP"} /></label><label>SMTP host<input name="host" required defaultValue={delivery?.host ?? "mail.buttercupchildrenstrust.org.uk"} /></label><label>Port<input name="port" type="number" min="1" max="65535" required defaultValue={delivery?.port ?? 465} /></label><label>Username<input name="username" required defaultValue={delivery?.username ?? "appeals@buttercupchildrenstrust.org.uk"} /></label><label>SMTP password<input name="password" type="password" autoComplete="off" placeholder={delivery?.passwordConfigured ? "Leave blank to keep existing password" : "Mailbox password or app password"} /></label><label>From name<input name="fromName" required defaultValue={delivery?.fromName ?? "Buttercup Children's Trust"} /></label><label>From email<input name="fromEmail" type="email" required defaultValue={delivery?.fromEmail ?? "appeals@buttercupchildrenstrust.org.uk"} /></label><label>Reply-to email<input name="replyToEmail" type="email" defaultValue={delivery?.replyToEmail ?? "appeals@buttercupchildrenstrust.org.uk"} /></label><label>Test recipient<input name="testRecipient" type="email" placeholder="karl.coulter@leodisdigital.co.uk" /></label><label className="checkbox-label"><input name="secure" type="checkbox" defaultChecked={delivery?.secure ?? true} /> SSL/TLS</label><label className="checkbox-label"><input name="enabled" type="checkbox" defaultChecked={delivery?.enabled ?? false} /> Enable sending profile</label>{delivery?.lastTestStatus ? <p className="form-help">Last test: {delivery.lastTestStatus} {delivery.lastTestMessage ? `- ${delivery.lastTestMessage}` : ""}</p> : null}{error ? <p className="form-error">{error}</p> : null}{success ? <p className="form-success">{success}</p> : null}<div className="form-actions"><button className="button secondary" type="button" onClick={(event) => test(event.currentTarget.form!)}>Test SMTP</button><Button type="submit">Save email settings</Button></div></form></section>;
}

function IntegrationSettings({ configuration, reload }: { configuration: Configuration; reload: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function run(action: "save" | "test", form: HTMLFormElement) {
    setError("");
    setSuccess("");
    try {
      const result = await post<{ companyName?: string }>(
        action === "save" ? "/api/settings/companies-house" : "/api/settings/companies-house/test",
        Object.fromEntries(new FormData(form)),
      );
      if (action === "save") {
        form.reset();
        await reload();
        setSuccess("Companies House integration updated.");
      } else {
        setSuccess(`Connection successful${result.companyName ? `: ${result.companyName}` : "."}`);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function runGoogle(action: "save" | "test", form: HTMLFormElement) {
    setError("");
    setSuccess("");
    try {
      const result = await post<{ sample?: string }>(
        action === "save" ? "/api/settings/google-places" : "/api/settings/google-places/test",
        Object.fromEntries(new FormData(form)),
      );
      if (action === "save") {
        form.reset();
        await reload();
        setSuccess("Google Places integration updated.");
      } else {
        setSuccess(`Connection successful${result.sample ? `: ${result.sample}` : "."}`);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function updateTargetIntake(enabled: boolean, form: HTMLFormElement) {
    setError("");
    setSuccess("");
    try {
      await post("/api/settings/client-target-intake", {
        enabled,
        evidenceReference: new FormData(form).get("evidenceReference"),
      });
      await reload();
      setSuccess(`Client-provided target intake ${enabled ? "enabled" : "disabled"}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <div className="settings-columns">
    <section className="panel settings-panel">
      <div className="panel-head"><div><h2>Companies House</h2><p>Verify company status and entity type using the official API.</p></div><Status value={configuration.companiesHouseConfigured ? "configured" : "not configured"} /></div>
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); run("save", event.currentTarget); }}>
        <label>API key<input name="apiKey" type="password" maxLength={500} autoComplete="off" placeholder={configuration.companiesHouseConfigured ? "Enter a replacement key" : "Enter Companies House API key"} /></label>
        <p className="form-help">The key is encrypted before storage and is never returned to the browser. Save an empty value to remove the stored key.</p>
        {error ? <p className="form-error">{error}</p> : null}
        {success ? <p className="form-success">{success}</p> : null}
        <div className="form-actions"><button className="button secondary" type="button" onClick={(event) => run("test", event.currentTarget.form!)}>Test connection</button><Button type="submit">Save integration</Button></div>
      </form>
	    </section>
    <section className="panel settings-panel">
      <div className="panel-head"><div><h2>Google Places</h2><p>Discover organisations from category and location searches.</p></div><Status value={configuration.googlePlacesConfigured ? "configured" : "not configured"} /></div>
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); runGoogle("save", event.currentTarget); }}>
        <label>API key<input name="apiKey" type="password" maxLength={500} autoComplete="off" placeholder={configuration.googlePlacesConfigured ? "Enter a replacement key" : "Enter Google Places API key"} /></label>
        <p className="form-help">Used for governed Google discovery. The key is encrypted before storage and is never returned to the browser.</p>
        <div className="form-actions"><button className="button secondary" type="button" onClick={(event) => runGoogle("test", event.currentTarget.form!)}>Test connection</button><Button type="submit">Save integration</Button></div>
      </form>
    </section>
    <EmailDeliverySettings configuration={configuration} reload={reload} />
	    <section className="panel settings-panel">
      <div className="panel-head"><div><h2>Client-provided targets</h2><p>Control manual target intake as a governed source class.</p></div><Status value={configuration.clientTargetIntakeEnabled ? "enabled" : "disabled"} /></div>
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); updateTargetIntake(true, event.currentTarget); }}>
        <label>Approval evidence reference<input name="evidenceReference" required={!configuration.clientTargetIntakeEnabled} placeholder="Policy register, contract, or approval reference" /></label>
        <div className="notice amber"><CircleAlert size={18} /><span>Enabling this source confirms provenance and permitted-use checks are documented.</span></div>
        <div className="form-actions">{configuration.clientTargetIntakeEnabled ? <button className="button secondary" type="button" onClick={(event) => updateTargetIntake(false, event.currentTarget.form!)}>Disable intake</button> : <Button type="submit">Enable intake</Button>}</div>
      </form>
    </section>
    <SourceRegistry />
    </div>
  );
}

function CharityPrincipalSettings({ configuration, reload }: { configuration: Configuration; reload: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    try {
      const result = await post<{ status: string }>("/api/settings/charity-principal/verify", Object.fromEntries(new FormData(event.currentTarget)));
      await reload();
      setSuccess(`Principal evidence recorded: ${result.status.replaceAll("_", " ")}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return <section className="panel settings-panel"><div className="panel-head"><div><h2>Buttercup principal</h2><p>Store register identifiers and evidence before campaign export.</p></div><Status value={configuration.charityPrincipal?.status ?? "unverified"} /></div><form className="form-stack" onSubmit={submit}><label>Legal name<input name="legalName" defaultValue="Buttercup Children's Trust" required /></label><label>Charity Commission number<input name="charityCommissionNumber" defaultValue="1128027" required /></label><label>OSCR number<input name="oscrNumber" defaultValue="SC042679" required /></label><label>Company number<input name="companyNumber" defaultValue="06666946" required /></label><label>Public website<input name="publicWebsite" placeholder="https://..." /></label><label>Evidence reference<input name="evidenceReference" required placeholder="Register review or compliance file reference" /></label>{error ? <p className="form-error">{error}</p> : null}{success ? <p className="form-success">{success}</p> : null}<div className="form-actions"><Button type="submit">Record principal evidence</Button></div></form></section>;
}

function ChannelPolicySettings({ configuration, reload }: { configuration: Configuration; reload: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const policy = configuration.channelPolicy;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const data = new FormData(event.currentTarget);
    try {
      await post("/api/settings/channel-policy", {
        corporateEmailEnabled: data.get("corporateEmailEnabled") === "on",
        postalLetterEnabled: data.get("postalLetterEnabled") === "on",
        individualEmailEnabled: data.get("individualEmailEnabled") === "on",
        telephoneEnabled: data.get("telephoneEnabled") === "on",
        letterTemplateApproved: data.get("letterTemplateApproved") === "on",
        selfPrintFulfilmentEnabled: data.get("selfPrintFulfilmentEnabled") === "on",
        providerFulfilmentEnabled: data.get("providerFulfilmentEnabled") === "on",
        evidenceReference: data.get("evidenceReference"),
      });
      await reload();
      setSuccess("Channel policy updated.");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return <section className="panel settings-panel"><div className="panel-head"><div><h2>Channel policy</h2><p>Enable outreach channels only after evidence is recorded.</p></div><Status value={policy?.corporateEmailEnabled || policy?.postalLetterEnabled ? "active" : "disabled"} /></div><form className="form-stack" onSubmit={submit}><label className="setting-toggle"><input name="corporateEmailEnabled" type="checkbox" defaultChecked={policy?.corporateEmailEnabled} /><span><strong>Corporate email</strong><small>Verified corporate role mailbox only.</small></span></label><label className="setting-toggle"><input name="postalLetterEnabled" type="checkbox" defaultChecked={policy?.postalLetterEnabled} /><span><strong>Postal letters</strong><small>Address, lawful basis, template, and suppression checks required.</small></span></label><label className="setting-toggle"><input name="individualEmailEnabled" type="checkbox" defaultChecked={policy?.individualEmailEnabled} /><span><strong>Individual email</strong><small>Consent-required records only.</small></span></label><label className="setting-toggle"><input name="letterTemplateApproved" type="checkbox" defaultChecked={policy?.letterTemplateApproved} /><span><strong>Letter template approved</strong><small>Controller identity and Do Not Contact route included.</small></span></label><label className="setting-toggle"><input name="selfPrintFulfilmentEnabled" type="checkbox" defaultChecked={policy?.selfPrintFulfilmentEnabled} /><span><strong>Self-print fulfilment</strong><small>Download manifest for approved letters.</small></span></label><label className="setting-toggle"><input name="providerFulfilmentEnabled" type="checkbox" defaultChecked={policy?.providerFulfilmentEnabled} /><span><strong>Provider fulfilment</strong><small>Disabled until vendor evidence exists.</small></span></label><label>Evidence reference<input name="evidenceReference" defaultValue={policy?.evidenceReference ?? ""} placeholder="Channel policy approval reference" /></label>{error ? <p className="form-error">{error}</p> : null}{success ? <p className="form-success">{success}</p> : null}<div className="form-actions"><Button type="submit">Save channel policy</Button></div></form></section>;
}

function LetterTemplateSettings() {
  const [items, setItems] = useState<LetterTemplateRow[] | null>(null);
  const [error, setError] = useState("");
  const load = () => api<LetterTemplateRow[]>("/api/settings/letter-templates").then(setItems);
  useEffect(() => { load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await post("/api/settings/letter-templates", {
        version: data.get("version"),
        name: data.get("name"),
        subjectLine: data.get("subjectLine"),
        bodyText: data.get("bodyText"),
        mergeFields: String(data.get("mergeFields") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        controllerIdentity: data.get("controllerIdentity"),
        doNotContactRoute: data.get("doNotContactRoute"),
        evidenceReference: data.get("evidenceReference"),
        expiresAt: data.get("expiresAt"),
        approved: data.get("approved") === "on",
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return <section className="panel settings-panel source-registry"><div className="panel-head"><div><h2>Letter templates</h2><p>Create approved postal letter templates with controller identity and Do Not Contact route.</p></div><Status value={items?.some((item) => item.approved) ? "active" : "disabled"} /></div><form className="form-grid compact-form" onSubmit={submit}><label>Version<input name="version" required placeholder="letter-2026-01" /></label><label>Name<input name="name" required placeholder="Buttercup fundraising letter" /></label><label>Expires<input name="expiresAt" type="date" required /></label><label className="wide">Optional heading / subject<input name="subjectLine" placeholder="Buttercup Children's Trust fundraising appeal" /></label><label className="wide">Body<textarea name="bodyText" required minLength={20} placeholder={"Dear {{contact_name}},\n\nLetter copy...\n\nDo Not Contact: {{do_not_contact_url}}"} /></label><label className="wide">Merge fields<input name="mergeFields" placeholder="organisation_name, contact_name, do_not_contact_url" /></label><label className="wide">Controller identity<input name="controllerIdentity" required placeholder="Buttercup Children's Trust" /></label><label className="wide">Do Not Contact route<input name="doNotContactRoute" required defaultValue="/do-not-contact" /></label><label className="wide">Evidence reference<input name="evidenceReference" required placeholder="Template approval reference" /></label><label className="checkbox-label"><input name="approved" type="checkbox" /> Approved</label>{error ? <p className="form-error">{error}</p> : null}<div className="form-actions"><Button type="submit">Save letter template</Button></div></form>{!items ? <Loading /> : items.length ? <div className="table-wrap"><table><thead><tr><th>Template</th><th>Content</th><th>Evidence</th><th>Expiry</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><span>{item.version}</span></td><td>{item.subject_line || "Letter body"}<span>{item.merge_fields?.join(", ") || "No merge fields"}</span></td><td>{item.evidence_reference}</td><td>{new Date(item.expires_at).toLocaleDateString()}</td><td><Status value={item.approved ? "approved" : "draft"} /></td></tr>)}</tbody></table></div> : <Empty text="No letter templates recorded." />}</section>;
}

function EmailTemplateSettings() {
  const [items, setItems] = useState<EmailTemplateRow[] | null>(null);
  const [error, setError] = useState("");
  const load = () => api<EmailTemplateRow[]>("/api/settings/email-templates").then(setItems);
  useEffect(() => { load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await post("/api/settings/email-templates", {
        version: data.get("version"),
        name: data.get("name"),
        subjectLine: data.get("subjectLine"),
        bodyText: data.get("bodyText"),
        mergeFields: String(data.get("mergeFields") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        controllerIdentity: data.get("controllerIdentity"),
        doNotContactRoute: data.get("doNotContactRoute"),
        evidenceReference: data.get("evidenceReference"),
        expiresAt: data.get("expiresAt"),
        approved: data.get("approved") === "on",
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return <section className="panel settings-panel source-registry"><div className="panel-head"><div><h2>Email templates</h2><p>Create approved email copy for corporate-role mailbox outreach.</p></div><Status value={items?.some((item) => item.approved) ? "active" : "disabled"} /></div><form className="form-grid compact-form" onSubmit={submit}><label>Version<input name="version" required placeholder="email-2026-01" /></label><label>Name<input name="name" required placeholder="Buttercup introduction email" /></label><label>Expires<input name="expiresAt" type="date" required /></label><label className="wide">Subject<input name="subjectLine" required placeholder="Partnership enquiry from Buttercup Children's Trust" /></label><label className="wide">Body<textarea name="bodyText" required minLength={20} placeholder={"Hello,\n\nEmail copy...\n\nDo Not Contact: {{do_not_contact_url}}"} /></label><label className="wide">Merge fields<input name="mergeFields" placeholder="organisation_name, role_mailbox, do_not_contact_url" /></label><label className="wide">Controller identity<input name="controllerIdentity" required placeholder="Buttercup Children's Trust" /></label><label className="wide">Do Not Contact route<input name="doNotContactRoute" required defaultValue="/do-not-contact" /></label><label className="wide">Evidence reference<input name="evidenceReference" required placeholder="Template approval reference" /></label><label className="checkbox-label"><input name="approved" type="checkbox" /> Approved</label>{error ? <p className="form-error">{error}</p> : null}<div className="form-actions"><Button type="submit">Save email template</Button></div></form>{!items ? <Loading /> : items.length ? <div className="table-wrap"><table><thead><tr><th>Template</th><th>Subject</th><th>Evidence</th><th>Expiry</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><span>{item.version}</span></td><td>{item.subject_line}<span>{item.merge_fields?.join(", ") || "No merge fields"}</span></td><td>{item.evidence_reference}</td><td>{new Date(item.expires_at).toLocaleDateString()}</td><td><Status value={item.approved ? "approved" : "draft"} /></td></tr>)}</tbody></table></div> : <Empty text="No email templates recorded." />}</section>;
}

function LaunchSettings({ configuration, reload }: { configuration: Configuration; reload: () => Promise<void> }) {
  const [enabled, setEnabled] = useState(configuration.productionExportsEnabled);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [gates, setGates] = useState<LaunchGate[]>([]);
  useEffect(() => setEnabled(configuration.productionExportsEnabled), [configuration.productionExportsEnabled]);
  useEffect(() => { api<LaunchGate[]>("/api/settings/launch-gates").then(setGates); }, []);
  async function updateGate(gate: LaunchGate, form: HTMLFormElement) {
    try {
      await post(`/api/settings/launch-gates/${gate.key}`, {
        completed: !gate.completed,
        evidenceReference: new FormData(form).get("evidenceReference"),
      });
      setGates(await api<LaunchGate[]>("/api/settings/launch-gates"));
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const form = new FormData(event.currentTarget);
    try {
      await post("/api/settings/launch", {
        productionExportsEnabled: enabled,
        confirmation: form.get("confirmation"),
      });
      await reload();
      setSuccess(`Production exports ${enabled ? "enabled" : "disabled"}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <div className="settings-columns">
      <CharityPrincipalSettings configuration={configuration} reload={reload} />
      <ChannelPolicySettings configuration={configuration} reload={reload} />
      <EmailTemplateSettings />
      <LetterTemplateSettings />
      <section className="panel settings-panel">
        <div className="panel-head"><div><h2>Production eligible exports</h2><p>Administrator-controlled release gate for CSV exports.</p></div><Status value={configuration.productionExportsEnabled ? "enabled" : "locked"} /></div>
        <form className="form-stack" onSubmit={submit}>
          <label className="setting-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span><strong>Allow production exports</strong><small>Only leads passing every current eligibility and suppression check can be exported.</small></span></label>
          {enabled && !configuration.productionExportsEnabled ? <label>Type ENABLE PRODUCTION EXPORTS to confirm<input name="confirmation" required autoComplete="off" /></label> : null}
          <div className="notice amber"><CircleAlert size={18} /><span>Enable only after the launch gates and required professional review in the compliance decision register are complete.</span></div>
          {error ? <p className="form-error">{error}</p> : null}
          {success ? <p className="form-success">{success}</p> : null}
          <div className="form-actions"><Button type="submit">Save launch control</Button></div>
        </form>
      </section>
      <section className="panel settings-panel launch-gates-panel">
        <div className="panel-head"><div><h2>Mandatory launch gates</h2><p>Each completed gate requires a recorded evidence reference.</p></div><Status value={gates.length > 0 && gates.every((gate) => gate.completed) ? "complete" : "incomplete"} /></div>
        <div className="gate-list">{gates.map((gate) => <form key={gate.key} className="gate-row" onSubmit={(event) => { event.preventDefault(); updateGate(gate, event.currentTarget); }}><div><strong>{gate.label}</strong><span>{gate.description}</span></div><input name="evidenceReference" defaultValue={gate.evidence_reference ?? ""} placeholder="Evidence reference" required={!gate.completed} /><Button type="submit" kind="secondary">{gate.completed ? "Reopen" : "Complete"}</Button></form>)}</div>
      </section>
      <section className="panel settings-panel">
        <div className="panel-head"><div><h2>Live source collection</h2><p>The maintenance worker is operational; external website collection remains disabled.</p></div><Status value="unavailable" /></div>
        <div className="notice amber"><CircleAlert size={18} /><span>Live collection cannot be enabled until approved source policies and the governed collection pipeline are complete.</span></div>
      </section>
    </div>
  );
}

function SettingsPage({ user, refresh }: { user: User; refresh: () => Promise<void> }) {
  const [tab, setTab] = useState<"account" | "integrations" | "launch">("account");
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const reload = async () => {
    setConfiguration(await api<Configuration>("/api/settings/configuration"));
    await refresh();
  };
  useEffect(() => { if (user.role === "owner") api<Configuration>("/api/settings/configuration").then(setConfiguration); }, [user.role]);
  return (
    <>
      <PageHeader title="Settings" copy="Manage your account, integrations, and owner-controlled launch gates." />
      <div className="settings-tabs">
        <button className={tab === "account" ? "active" : ""} onClick={() => setTab("account")}>Account</button>
        {user.role === "owner" ? <button className={tab === "integrations" ? "active" : ""} onClick={() => setTab("integrations")}>Integrations</button> : null}
        {user.role === "owner" ? <button className={tab === "launch" ? "active" : ""} onClick={() => setTab("launch")}>Launch controls</button> : null}
      </div>
      {tab === "account" ? <AccountSettings user={user} /> : !configuration ? <Loading /> : tab === "integrations" ? <IntegrationSettings configuration={configuration} reload={reload} /> : <LaunchSettings configuration={configuration} reload={reload} />}
    </>
  );
}

function Control({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return <div className="control-row">{ok ? <CheckCircle2 className="ok" size={19} /> : <CircleAlert className="warn" size={19} />}<div><strong>{label}</strong><span>{detail}</span></div></div>;
}

function Empty({ text }: { text: string }) { return <div className="empty"><FileSearch size={28} /><p>{text}</p></div>; }
function Loading() { return <div className="loading"><span /><span /><span /></div>; }

export function App() {
  const { path, go } = usePath();
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const refresh = async () => {
    const nextBootstrap = await api<Bootstrap>("/api/bootstrap");
    setBootstrap(nextBootstrap);
    if (!nextBootstrap.setupRequired) {
      setUser(await api<User>("/api/me").catch(() => null));
    } else setUser(null);
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => { if (user) api<Campaign[]>("/api/campaigns").then(setCampaigns); }, [user, path]);
  const campaignId = useMemo(() => path.match(/^\/campaigns\/([^/]+)$/)?.[1], [path]);
  if (!bootstrap || user === undefined) return <div className="full-loading"><Loading /></div>;
  if (path === "/objection") return <PublicRequestPage mode="objection" />;
  if (path === "/rights") return <PublicRequestPage mode="rights" />;
  if (path === "/complaint") return <PublicRequestPage mode="complaint" />;
  if (path === "/do-not-contact") return <DoNotContactPage />;
  if (bootstrap.setupRequired) return <Setup onDone={refresh} />;
  if (!user) return <Login onDone={refresh} />;
  let page: ReactNode;
  if (path === "/") page = <Overview bootstrap={bootstrap} go={go} />;
  else if (path === "/campaigns") page = <Campaigns go={go} />;
  else if (path === "/campaigns/new") page = <NewCampaign go={go} user={user} />;
  else if (campaignId) page = <CampaignDetail id={campaignId} bootstrap={bootstrap} user={user} />;
  else if (path === "/leads") page = <AllLeads campaigns={campaigns} go={go} />;
  else if (path === "/suppression") page = <Suppression />;
  else if (path === "/compliance") page = <Compliance bootstrap={bootstrap} />;
  else if (path === "/settings") page = <SettingsPage user={user} refresh={refresh} />;
  else page = <Empty text="Page not found." />;
  return <Shell user={user} path={path} go={go} logout={async () => { await post("/api/logout", {}); setUser(null); go("/"); }}>{page}</Shell>;
}
