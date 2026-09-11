import type { Metadata } from "next";

export const metadata: Metadata = { title: "Exclusão de conta | FitCore" };

export default function Page() {
  return <>
    <span className="fitcore-legal-eyebrow">Conta e dados</span>
    <h1>Solicitar exclusão de conta</h1>
    <p>Contas FitCore são vinculadas a uma unidade. O titular pode solicitar exclusão ou anonimização dos dados aplicáveis ao responsável da unidade ou ao canal de suporte previsto na relação contratual.</p>
    <h2>O que informar</h2>
    <ul>
      <li>identificador utilizado no FitCore;</li>
      <li>nome ou slug da unidade;</li>
      <li>qual dado ou conta deseja excluir.</li>
    </ul>
    <h2>O que acontece depois</h2>
    <p>A solicitação precisa ser validada para evitar exclusão indevida. Dados sujeitos a obrigação legal, financeira, auditoria ou defesa de direitos podem exigir retenção pelo período aplicável; os demais devem seguir a política vigente de exclusão ou anonimização.</p>
    <p className="fitcore-legal-note">O app móvel atual não cria contas diretamente. A criação e gestão de usuários ocorre pela unidade FitCore.</p>
  </>;
}
