import type { Metadata } from "next";

export const metadata: Metadata = { title: "Segurança | FitCore" };

export default function Page() {
  return <>
    <span className="fitcore-legal-eyebrow">Segurança</span>
    <h1>Como protegemos a operação</h1>
    <p>O FitCore foi estruturado para separar unidades, perfis e operações, mantendo controles de autenticação e auditoria próximos dos dados.</p>
    <h2>Controles técnicos</h2>
    <ul>
      <li>HTTPS obrigatório nas superfícies públicas;</li>
      <li>sessões assinadas e cookies seguros;</li>
      <li>isolamento por tenant e permissões por papel;</li>
      <li>segredos fora do repositório;</li>
      <li>auditoria para operações sensíveis e rate limiting no acesso.</li>
    </ul>
    <h2>Mobile</h2>
    <p>O aplicativo armazena a credencial de sessão em armazenamento seguro e mantém apenas o estado necessário para permitir continuidade de treino e sincronização offline.</p>
    <p className="fitcore-legal-note">Nenhum sistema é isento de risco. Incidentes devem ser tratados pelo processo operacional e jurídico aplicável à unidade e ao FitCore.</p>
  </>;
}
