"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Tenant = {
  id: string;
  slug: string;
  nome: string;
  status: string;
  tipo_negocio?: string | null;
  plano?: string | null;
};

type InternalMode = "full" | "essencial" | "profissional" | "business" | "enterprise";
type Invite = { id: string; email: string; status: string; expires_at: string };
type State = "loading" | "ready" | "error";

export function PlatformOwnerConsole() {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [platformRole, setPlatformRole] = useState("");
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState("");
  const [modes, setModes] = useState<Record<string, InternalMode>>({});
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteUrl, setInviteUrl] = useState("");
  async function loadControlPlane() {
    try {
      const response = await fetch("/api/platform-owner/tenants", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.mensagem || data.erro || "Acesso indisponível.");
      setTenants(data.tenants || []);
      setPlatformRole(data.platform_role || "");
      if (data.platform_role === "platform_owner") {
        const inviteResponse = await fetch("/api/platform-owner/invites", { credentials: "include", cache: "no-store" });
        const inviteData = await inviteResponse.json().catch(() => ({}));
        if (inviteResponse.ok) setInvites(inviteData.invites || []);
      }
      setState("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar as unidades.");
      setState("error");
    }
  }

  useEffect(() => { void loadControlPlane(); }, []);

  async function enterTenant(tenant: Tenant) {
    setSwitching(tenant.id);
    setError("");
    try {
      const response = await fetch("/api/platform-owner/switch", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant_id: tenant.id, internal_product_mode: modes[tenant.id] || "full" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.mensagem || data.erro || "Não foi possível entrar nesta unidade.");
      router.replace("/dashboard");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível entrar nesta unidade.");
      setSwitching("");
    }
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInviteUrl("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const response = await fetch("/api/platform-owner/invites", {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) { setError(data.mensagem || data.erro || "Convite não criado."); return; }
    setInviteUrl(data.invite_url || "");
    event.currentTarget.reset();
    await loadControlPlane();
  }
  return (
    <main className="route-page premium-workspace" data-mode="platform-owner">
      <div className="route-hero">
        <div>
          <p className="eyebrow">FitCore Control Plane</p>
          <h1>Acesso interno da plataforma.</h1>
          <p>Teste o produto completo sem cobrança ou simule os planos comerciais sem alterar a assinatura real da unidade.</p>
        </div>
        <div className="hero-actions-inline"><Link className="button secondary" href="/login">Trocar conta</Link></div>
      </div>

      <section className="panel wide">
        <p className="eyebrow">Internal Product Access</p>
        <h2>{platformRole === "platform_owner" ? "Proprietário raiz" : "Delegate interno"}</h2>
        <p>Acesso Total equivale ao conjunto Enterprise implementado, com billing isento e checkout dispensado.</p>
      </section>

      {platformRole === "platform_owner" ? (
        <section className="panel wide">
          <h2>Convidar acesso interno</h2>
          <p>Somente o proprietário raiz pode emitir convites. O convidado entra como platform_delegate e não pode convidar outras pessoas.</p>
          <form className="operational-form" onSubmit={createInvite}>
            <label>E-mail do convidado<input name="email" type="email" required /></label>
            <button type="submit">Criar convite interno</button>
          </form>
          {inviteUrl ? <p><strong>Link do convite:</strong> <a href={inviteUrl}>{inviteUrl}</a></p> : null}
          <div className="item-list">{invites.map((invite) => <article className="item" key={invite.id}><strong>{invite.email}</strong><span>{invite.status} · expira {new Date(invite.expires_at).toLocaleString("pt-BR")}</span></article>)}</div>
        </section>
      ) : null}
      {state === "loading" ? <section className="panel"><h2>Carregando unidades...</h2></section> : null}
      {error ? <section className="panel"><h2>Não foi possível continuar</h2><p>{error}</p></section> : null}
      {state === "ready" ? (
        <section className="dashboard-grid">
          {tenants.map((tenant) => (
            <article className="panel" key={tenant.id}>
              <p className="eyebrow">{tenant.tipo_negocio || "unidade"}</p>
              <h2>{tenant.nome}</h2>
              <p>{tenant.slug} · {tenant.status} · plano real: {tenant.plano || "padrão"}</p>
              <label>Modo de teste
                <select value={modes[tenant.id] || "full"} onChange={(event) => setModes((current) => ({ ...current, [tenant.id]: event.target.value as InternalMode }))}>
                  <option value="full">Acesso Total · sem cobrança</option>
                  <option value="essencial">Simular Essencial</option>
                  <option value="profissional">Simular Profissional</option>
                  <option value="business">Simular Business</option>
                  <option value="enterprise">Simular Enterprise</option>
                </select>
              </label>
              <button type="button" disabled={Boolean(switching)} onClick={() => enterTenant(tenant)}>
                {switching === tenant.id ? "Entrando..." : "Entrar e testar"}
              </button>
            </article>
          ))}
          {!tenants.length ? <article className="panel"><h2>Nenhuma unidade disponível.</h2></article> : null}
        </section>
      ) : null}
    </main>
  );
}
