"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Tenant = {
  id: string;
  slug: string;
  nome: string;
  status: string;
  tipo_negocio?: string | null;
  plano?: string | null;
};

type State = "loading" | "ready" | "error";

export function PlatformOwnerConsole() {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState("");

  useEffect(() => {
    fetch("/api/platform-owner/tenants", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.mensagem || data.erro || "Acesso indisponível.");
        setTenants(data.tenants || []);
        setState("ready");
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Não foi possível carregar as unidades.");
        setState("error");
      });
  }, []);

  async function enterTenant(tenant: Tenant) {
    setSwitching(tenant.id);
    setError("");
    try {
      const response = await fetch("/api/platform-owner/switch", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant_id: tenant.id }),
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

  return (
    <main className="route-page premium-workspace" data-mode="platform-owner">
      <div className="route-hero">
        <div>
          <p className="eyebrow">FitCore Control Plane</p>
          <h1>Acesso do proprietário da plataforma.</h1>
          <p>Escolha uma unidade para testar o produto com permissões de gestor, sem criar outro login.</p>
        </div>
        <div className="hero-actions-inline">
          <Link className="button secondary" href="/login">Trocar conta</Link>
        </div>
      </div>
      {state === "loading" ? <section className="panel"><h2>Carregando unidades...</h2></section> : null}
      {error ? <section className="panel"><h2>Não foi possível continuar</h2><p>{error}</p></section> : null}
      {state === "ready" ? (
        <section className="dashboard-grid">
          {tenants.map((tenant) => (
            <article className="panel" key={tenant.id}>
              <p className="eyebrow">{tenant.tipo_negocio || "unidade"}</p>
              <h2>{tenant.nome}</h2>
              <p>{tenant.slug} · {tenant.status} · {tenant.plano || "plano padrão"}</p>
              <button
                type="button"
                disabled={Boolean(switching)}
                onClick={() => enterTenant(tenant)}
              >
                {switching === tenant.id ? "Entrando..." : "Entrar nesta unidade"}
              </button>
            </article>
          ))}
          {!tenants.length ? <article className="panel"><h2>Nenhuma unidade disponível.</h2></article> : null}
        </section>
      ) : null}
    </main>
  );
}
