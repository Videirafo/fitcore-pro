"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = { token: string };

export function PlatformDelegateAccept({ token }: Props) {
  const router = useRouter();
  const [invite, setInvite] = useState<{ email?: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/platform-owner/invites/inspect?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.erro || "Convite indisponível.");
        setInvite(data.invite || null);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Convite indisponível."))
      .finally(() => setLoading(false));
  }, [token]);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/platform-owner/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        email: String(form.get("email") || ""),
        nome: String(form.get("nome") || ""),
        senha: String(form.get("senha") || ""),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      setError(data.mensagem || data.erro || "Não foi possível aceitar o convite.");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  if (loading) return <section className="panel"><h2>Validando convite...</h2></section>;
  if (!invite) return <section className="panel"><h2>Convite indisponível</h2><p>{error}</p></section>;

  return (
    <section className="panel operational-form">
      <h2>Aceitar acesso interno</h2>
      <p>Este convite cria um acesso platform_delegate. Ele não concede permissão para convidar outras pessoas.</p>
      <form onSubmit={accept}>
        <label>Nome<input name="nome" required /></label>
        <label>E-mail<input name="email" type="email" required defaultValue={invite.email || ""} readOnly /></label>
        <label>Senha<input name="senha" type="password" minLength={8} required /></label>
        <button type="submit">Ativar acesso interno</button>
      </form>
      {error ? <p>{error}</p> : null}
    </section>
  );
}
