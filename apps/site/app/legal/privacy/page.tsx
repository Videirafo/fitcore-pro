import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacidade | FitCore" };

export default function Page() {
  return <>
    <span className="fitcore-legal-eyebrow">Privacidade e LGPD</span>
    <h1>Política de privacidade</h1>
    <p>O FitCore trata dados necessários para autenticação, gestão da unidade, prescrição, execução e evolução de treinos. Dependendo dos módulos usados, podem existir dados de medidas, fotos de evolução, fitness, pagamentos e acesso.</p>
    <h2>Finalidades</h2>
    <ul>
      <li>entregar as funções contratadas pela unidade e pelo aluno;</li>
      <li>manter segurança, sessão, auditoria e prevenção de abuso;</li>
      <li>registrar treinos, séries e evolução quando o usuário utiliza essas funções.</li>
    </ul>
    <h2>Proteção e compartilhamento</h2>
    <p>O acesso é limitado por unidade e perfil. Integrações externas devem ser avaliadas antes do envio de dados. O FitCore não deve registrar dados sensíveis desnecessários em logs operacionais.</p>
    <h2>Direitos do titular</h2>
    <p>Solicitações de acesso, correção, portabilidade, oposição ou exclusão podem ser encaminhadas ao responsável da unidade ou pelo canal de suporte definido na relação contratual.</p>
    <p className="fitcore-legal-note">Esta política é uma baseline operacional e deve receber revisão jurídica e identificação do canal público de contato antes da publicação comercial definitiva.</p>
  </>;
}
