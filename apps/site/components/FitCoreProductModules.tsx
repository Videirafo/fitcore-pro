import Link from "next/link";

type Module = {
  title: string;
  category: string;
  description: string;
  href: string;
  metric: string;
  visual: "calendar" | "payments" | "crm" | "automation" | "anamnesis" | "evolution" | "portal" | "ai";
};

const modules: Module[] = [
  {
    title: "Agenda, aulas e avaliações",
    category: "Operação",
    description: "Calendário para aulas, avaliações físicas, retornos, horários do time e capacidade da unidade.",
    href: "/agenda",
    metric: "ocupação + presença",
    visual: "calendar",
  },
  {
    title: "Planos, pagamentos e inadimplência",
    category: "Receita",
    description: "Planos recorrentes, status financeiro, cobrança pendente, lembretes e visão do dono em um só fluxo.",
    href: "/financeiro",
    metric: "mensalidade + cobrança",
    visual: "payments",
  },
  {
    title: "CRM de leads e alunos inativos",
    category: "Retenção",
    description: "Funil de leads, alunos sem frequência, risco de evasão e ações de recuperação por prioridade.",
    href: "/relatorios",
    metric: "leads + churn",
    visual: "crm",
  },
  {
    title: "WhatsApp, email e automações",
    category: "Relacionamento",
    description: "Mensagens operacionais para presença, pagamento, reativação, avaliação e acompanhamento do aluno.",
    href: "/agents",
    metric: "follow-up automático",
    visual: "automation",
  },
  {
    title: "Ficha física e anamnese",
    category: "Aluno",
    description: "Histórico, objetivo, restrições, medidas, nível, observações do professor e consentimentos LGPD.",
    href: "/alunos",
    metric: "perfil completo",
    visual: "anamnesis",
  },
  {
    title: "Fotos, medidas e evolução",
    category: "Progresso",
    description: "Registro de execução, esforço, frequência, medidas, fotos comparativas e progresso por treino.",
    href: "/evolucao",
    metric: "resultado visível",
    visual: "evolution",
  },
  {
    title: "Portal do aluno",
    category: "Experiência",
    description: "Aluno acessa treino aprovado, vê GIFs, marca exercícios, registra esforço e acompanha progresso.",
    href: "/execucao",
    metric: "treino sem sair da sessão",
    visual: "portal",
  },
  {
    title: "IA de prescrição e retenção",
    category: "Inteligência",
    description: "Assistente com contexto real do tenant para prescrição, ajuste de carga, retenção e decisão do gestor.",
    href: "/agents",
    metric: "contexto + auditoria",
    visual: "ai",
  },
];

function ModuleVisual({ type }: { type: Module["visual"] }) {
  return <div className={`product-module-visual ${type}`} aria-hidden="true">
    <span className="visual-frame"><i /><i /><i /></span>
    <svg viewBox="0 0 260 150" role="img">
      {type === "calendar" ? <><rect x="28" y="28" width="204" height="96" rx="18"/><path d="M28 54h204M72 18v26M188 18v26"/><circle cx="76" cy="82" r="10"/><circle cx="130" cy="82" r="10"/><circle cx="184" cy="82" r="10"/><path className="accent" d="M58 112h144"/></> : null}
      {type === "payments" ? <><rect x="30" y="34" width="200" height="86" rx="18"/><path d="M52 62h154M52 88h72"/><path className="accent" d="M166 93l16 16 32-42"/><circle cx="72" cy="112" r="18"/></> : null}
      {type === "crm" ? <><rect x="28" y="26" width="92" height="98" rx="18"/><rect x="140" y="26" width="92" height="98" rx="18"/><circle cx="74" cy="65" r="20"/><path d="M46 106c18-28 44-28 62 0"/><path className="accent" d="M156 94h58M156 68h38"/></> : null}
      {type === "automation" ? <><circle cx="74" cy="76" r="34"/><circle cx="186" cy="76" r="34"/><path d="M108 76h44"/><path className="accent" d="M138 60l22 16-22 16M62 76h24M174 76h24"/></> : null}
      {type === "anamnesis" ? <><rect x="42" y="22" width="176" height="106" rx="18"/><circle cx="88" cy="68" r="22"/><path d="M58 112c18-31 43-31 61 0"/><path className="accent" d="M142 62h48M142 88h36M142 110h58"/></> : null}
      {type === "evolution" ? <><path d="M38 120h184M42 120V32"/><rect x="70" y="86" width="24" height="34" rx="7"/><rect x="116" y="68" width="24" height="52" rx="7"/><rect x="162" y="45" width="24" height="75" rx="7"/><path className="accent" d="M56 90c34-26 56-15 82-33 23-16 40-25 72-17"/></> : null}
      {type === "portal" ? <><rect x="58" y="20" width="144" height="110" rx="22"/><path d="M92 48h76M92 76h52M92 102h76"/><path className="accent" d="M54 76h34M172 76h34"/></> : null}
      {type === "ai" ? <><rect x="36" y="36" width="188" height="80" rx="22"/><path d="M82 76h96"/><path className="accent" d="M128 30l10 28 28 10-28 10-10 28-10-28-28-10 28-10z"/></> : null}
    </svg>
  </div>;
}

export function FitCoreProductModules() {
  return <section className="product-modules" id="operacao">
    <div className="product-modules-head">
      <span className="eyebrow">Produto completo</span>
      <h2>O FitCore precisa resolver operação, receita, retenção e experiência do aluno.</h2>
      <p>O sistema deixa de ser apenas tela de treino e passa a organizar o que dono, professor e aluno precisam no dia a dia.</p>
    </div>
    <div className="product-modules-grid">
      {modules.map((module) => <Link className="product-module-card" href={module.href} key={module.title}>
        <ModuleVisual type={module.visual} />
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
