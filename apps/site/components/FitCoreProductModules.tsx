import Link from "next/link";
import { ProductShot } from "./FitCoreProductShots";

type Module = {
  title: string;
  category: string;
  description: string;
  href: string;
  metric: string;
  shot: "business" | "team" | "students" | "workouts" | "execution" | "evolution";
};

const modules: Module[] = [
  {
    title: "Agenda, aulas e avaliações",
    category: "Operação",
    description: "Calendário para aulas, avaliações físicas, retornos, horários do time e capacidade da unidade.",
    href: "/agenda",
    metric: "ocupação + presença",
    shot: "business",
  },
  {
    title: "Planos, pagamentos e inadimplência",
    category: "Receita",
    description: "Planos recorrentes, status financeiro, cobrança pendente, lembretes e visão do dono em um só fluxo.",
    href: "/financeiro",
    metric: "mensalidade + cobrança",
    shot: "evolution",
  },
  {
    title: "CRM de leads e alunos inativos",
    category: "Retenção",
    description: "Funil de leads, alunos sem frequência, risco de evasão e ações de recuperação por prioridade.",
    href: "/relatorios",
    metric: "leads + churn",
    shot: "students",
  },
  {
    title: "WhatsApp, email e automações",
    category: "Relacionamento",
    description: "Mensagens operacionais para presença, pagamento, reativação, avaliação e acompanhamento do aluno.",
    href: "/agents",
    metric: "follow-up automático",
    shot: "team",
  },
  {
    title: "Ficha física e anamnese",
    category: "Aluno",
    description: "Histórico, objetivo, restrições, medidas, nível, observações do professor e consentimentos LGPD.",
    href: "/alunos",
    metric: "perfil completo",
    shot: "students",
  },
  {
    title: "Fotos, medidas e evolução",
    category: "Progresso",
    description: "Registro de execução, esforço, frequência, medidas, fotos comparativas e progresso por treino.",
    href: "/evolucao",
    metric: "resultado visível",
    shot: "evolution",
  },
  {
    title: "Portal do aluno",
    category: "Experiência",
    description: "Aluno acessa treino aprovado, vê GIFs, marca exercícios, registra esforço e acompanha progresso.",
    href: "/execucao",
    metric: "treino sem sair da sessão",
    shot: "execution",
  },
  {
    title: "IA de prescrição e retenção",
    category: "Inteligência",
    description: "Assistente com contexto real do tenant para prescrição, ajuste de carga, retenção e decisão do gestor.",
    href: "/agents",
    metric: "contexto + auditoria",
    shot: "workouts",
  },
];

export function FitCoreProductModules() {
  return <section className="product-modules product-modules-enterprise" id="operacao">
    <div className="product-modules-head">
      <span className="eyebrow">Produto completo</span>
      <h2>O FitCore resolve operação, receita, retenção e experiência do aluno.</h2>
      <p>Cards com telas do próprio produto: agenda, cobrança, CRM, automação, ficha, evolução, portal e IA.</p>
    </div>
    <div className="product-modules-grid enterprise-modules-grid">
      {modules.map((module) => <Link className="product-module-card enterprise-module-card" href={module.href} key={module.title}>
        <ProductShot kind={module.shot} title={module.title} />
        <div>
          <span>{module.category}</span>
          <strong>{module.title}</strong>
          <p>{module.description}</p>
        </div>
        <small>{module.metric}</small>
      </Link>)}
    </div>
  </section>;
}
