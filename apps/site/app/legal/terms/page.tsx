import type { Metadata } from "next";

export const metadata: Metadata = { title: "Termos | FitCore" };

export default function Page() {
  return <>
    <span className="fitcore-legal-eyebrow">Termos</span>
    <h1>Termos de uso</h1>
    <p>O FitCore é uma plataforma de apoio à gestão fitness, prescrição, execução e acompanhamento. O uso deve respeitar as permissões da unidade e as responsabilidades profissionais aplicáveis.</p>
    <h2>Responsabilidade profissional</h2>
    <p>Recursos de automação e inteligência artificial são ferramentas de apoio. Decisões sobre treinamento, avaliação, saúde, nutrição ou conduta profissional devem permanecer sob revisão humana qualificada quando aplicável.</p>
    <h2>Conta e acesso</h2>
    <ul>
      <li>cada credencial deve ser utilizada somente pelo usuário autorizado;</li>
      <li>o acesso é filtrado por unidade e papel;</li>
      <li>uso abusivo, automatizado ou incompatível com a segurança pode ser limitado.</li>
    </ul>
    <h2>Disponibilidade</h2>
    <p>Funcionalidades podem evoluir, receber manutenção ou ser substituídas preservando segurança, dados e contratos aplicáveis.</p>
    <p className="fitcore-legal-note">Texto operacional preliminar. A versão comercial definitiva deve passar por revisão jurídica.</p>
  </>;
}
