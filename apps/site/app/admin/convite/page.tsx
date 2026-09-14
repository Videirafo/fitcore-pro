import { PlatformDelegateAccept } from "../../../components/PlatformDelegateAccept";

export default async function PlatformDelegateInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const query = await searchParams;
  return (
    <main className="route-page premium-workspace" data-mode="platform-delegate-invite">
      <div className="route-hero">
        <div>
          <p className="eyebrow">FitCore Control Plane</p>
          <h1>Convite de acesso interno.</h1>
          <p>Ative seu acesso de teste sem cobrança. O convite não concede propriedade raiz.</p>
        </div>
      </div>
      <PlatformDelegateAccept token={String(query.token || "")} />
    </main>
  );
}
