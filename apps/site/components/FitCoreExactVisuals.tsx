import Link from "next/link";

const featureCards = [
  ["Criar negócio", "Configure sua estrutura e comece hoje.", "▥", "/onboarding"],
  ["Equipe", "Gerencie sua equipe e permissões.", "▦", "/equipe"],
  ["Alunos", "Cadastre, organize e acompanhe.", "●", "/alunos"],
  ["Treinos", "Prescreva treinos com agilidade.", "▰", "/treinos"],
  ["Execução", "Acompanhe execução e engajamento.", "▶", "/execucao"],
  ["Evolução", "Veja resultados com dados reais.", "▥", "/evolucao"],
];

const kpis = [
  ["Alunos ativos", "124", "↑ 12%", "em relação ao mês anterior"],
  ["Treinos executados", "892", "↑ 18%", "em relação ao mês anterior"],
  ["Evolução média", "+28%", "", "nos últimos 3 meses"],
  ["Alunos em dia", "92%", "", "frequência nas últimas 4 semanas"],
];

export function FitCoreExactLogo({ compact = false }: { compact?: boolean }) {
  return <span className={compact ? "fcx-logo is-compact" : "fcx-logo"}><b>FC</b></span>;
}

export function FitCoreExactLanding() {
  return <main className="fcx-public">
    <header className="fcx-public-nav">
      <Link href="/" className="fcx-brand"><FitCoreExactLogo /><span><strong>FitCore Pro</strong><small>Mais que treinos. Resultados.</small></span></Link>
      <nav><a href="#inicio">Início</a><a href="#funcionalidades">Funcionalidades</a><a href="#planos">Planos</a><a href="#depoimentos">Depoimentos</a><a href="#blog">Blog</a></nav>
      <div className="fcx-nav-actions"><button aria-label="Modo escuro">◐</button><Link href="/login">Entrar</Link><Link className="fcx-cta" href="/onboarding">Começar agora <span>→</span></Link></div>
    </header>
    <section className="fcx-hero" id="inicio">
      <div className="fcx-hero-copy">
        <span className="fcx-badge"><i />A plataforma completa para profissionais de fitness</span>
        <h1>Gerencie seus alunos, <em>treinos e evolução</em> em um só lugar.</h1>
        <p>Mais organização, mais resultados. O FitCore Pro ajuda você a gerir seu negócio, prescrever treinos, acompanhar a evolução dos alunos e tomar decisões com dados reais.</p>
        <div className="fcx-actions"><Link className="fcx-cta" href="/onboarding">Começar gratuitamente <span>→</span></Link><Link className="fcx-secondary" href="/dashboard"><b>▶</b> Ver demonstração</Link></div>
        <div className="fcx-checks"><span>Setup em minutos</span><span>Sem cartão de crédito</span><span>Suporte em português</span></div>
      </div>
      <FitCoreExactPreview />
    </section>
    <section className="fcx-feature-row" id="funcionalidades">{featureCards.map(([title, text, icon, href]) => <Link href={href} className="fcx-mini-card" key={title}><i>{icon}</i><strong>{title}</strong><p>{text}</p><span>→</span></Link>)}</section>
    <section className="fcx-lower-grid" id="planos">
      <article className="fcx-ai-banner"><span>NOVO</span><h2>Assistente IA para prescrição e acompanhamento</h2><p>Tenha um assistente inteligente ao seu lado para criar treinos personalizados, ajustar cargas e gerar recomendações baseadas na evolução de cada aluno.</p><div className="fcx-agent-input"><div><b>✦</b><p>Olá, sou o assistente FitCore. Posso criar um treino para hipertrofia, ajustar a carga do seu aluno ou analisar a evolução.</p></div><label><input placeholder="Digite sua solicitação..."/><button>➤</button></label></div></article>
      <article className="fcx-security-panel"><b>✓</b><h2>Seus dados, sempre protegidos</h2><p>Seguimos rigorosamente a LGPD e utilizamos padrões de segurança de nível empresarial para garantir a privacidade dos seus dados e dos seus alunos.</p><ul><li>LGPD <span>Em conformidade</span></li><li>Dados criptografados <span>TLS 1.3</span></li><li>Infraestrutura segura <span>VPS</span></li></ul></article>
    </section>
    <footer className="fcx-footer"><Link href="/" className="fcx-brand"><FitCoreExactLogo compact /><span><strong>FitCore Pro</strong><small>Profissionais mais fortes. Pessoas mais saudáveis.</small></span></Link><nav><a>Sobre</a><a>Funcionalidades</a><a>Planos</a><a>Segurança</a><a>Contato</a></nav><span>Feito para quem transforma vidas. ♥</span></footer>
  </main>;
}

function FitCoreExactPreview() {
  return <aside className="fcx-preview">
    <div className="fcx-preview-inner">
      <div className="fcx-preview-side"><FitCoreExactLogo compact /><nav><span className="active">⌂ Visão geral</span><span>Alunos</span><span>Treinos</span><span>Execução</span><span>Evolução</span><span>Financeiro</span><span>Equipe</span><span>Relatórios</span><span>Configurações</span></nav></div>
      <div className="fcx-preview-main"><div className="fcx-preview-head"><div><strong>👋 Olá, Fernando</strong><small>Aqui está o resumo do seu negócio hoje.</small></div><span>Seg, 9 de set de 2026</span></div><div className="fcx-preview-kpis">{kpis.map(([label, value, change, hint]) => <article key={label}><i>▥</i><small>{label}</small><b>{value}</b>{change ? <em>{change}</em> : null}<span>{hint}</span></article>)}</div><div className="fcx-preview-body"><section><header><b>Evolução dos alunos</b><span>Últimos 8 meses⌄</span></header><div className="fcx-line"><i/><i/><i/><i/><i/><i/><i/></div></section><aside><b>Alunos em destaque</b>{["Camila Rocha  ↑ 32%", "Bruno Almeida  ↑ 28%", "Letícia Santos  ↑ 41%"].map(x => <span key={x}>{x}</span>)}</aside></div></div>
    </div>
  </aside>;
}

const sidebarGroups = [
  ["", [["Visão geral", "⌂", "/dashboard"], ["Dashboard", "▦", "/dashboard"], ["Onboarding", "◎", "/onboarding"], ["Equipe", "♙", "/equipe"], ["Alunos", "♙", "/alunos"], ["Treinos", "▤", "/treinos"], ["Prescrição", "▧", "/treinos"], ["Execução", "▷", "/execucao"], ["Evolução", "▥", "/evolucao"], ["Biblioteca de GIFs", "▩", "/biblioteca"], ["Agentes IA", "✦", "/agents"]]],
  ["", [["Segurança & LGPD", "⌾", "/seguranca"], ["Configurações", "⚙", "/configuracoes"]]],
];

const dashboardKpis = [["Alunos ativos", "248", "↑ 12%", "vs. mês anterior", "▦"], ["Treinos ativos", "892", "↑ 18%", "vs. mês anterior", "▰"], ["Execuções hoje", "326", "↑ 18%", "vs. ontem", "▶"], ["Frequência semanal", "78%", "↑ 6%", "vs. semana anterior", "▥"], ["Esforço médio", "7,8", "↑ 9%", "vs. mês anterior", "ϟ"], ["Conclusões", "92%", "↑ 11%", "vs. mês anterior", "✓"]];
const flow = ["Negócio", "Equipe", "Alunos", "Prescrição", "Execução", "Evolução"];
const exercises = [["0026-barbell-bench-squat", "Agachamento livre", "Pernas · Glúteos"], ["0289-dumbbell-bench-press", "Supino reto", "Peito · Tríceps"], ["0159-cable-decline-seated-wide-grip-row", "Remada sentada", "Costas · Bíceps"]];
const pending = ["Carlos Almeida|Treino sem execução há 5 dias|Atenção", "Mariana Costa|Solicitou revisão de treino|Revisar", "Pedro Santos|Evolução abaixo do esperado|Atenção", "Juliana Ribeiro|Avaliação física pendente|Pendente", "Lucas Ferreira|Nova mensagem do aluno|Verificar"];

export function FitCoreExactDashboard() {
  return <main className="fcx-console">
    <aside className="fcx-sidebar"><Link href="/dashboard" className="fcx-side-brand"><FitCoreExactLogo /><span><strong>FitCore Pro</strong><small>Gestão fitness inteligente</small></span></Link>{sidebarGroups.map(([label, items], idx) => <section key={idx}>{label ? <p>{label}</p> : null}{(items as string[][]).map(([name, icon, href], i) => <Link key={`${name}-${i}`} className={i === 0 && idx === 0 ? "active" : ""} href={href}><i>{icon}</i>{name}</Link>)}</section>)}<div className="fcx-upgrade"><i>◆</i><strong>Mais resultados para o seu negócio</strong><p>A tecnologia certa para você transformar vidas.</p><Link href="/financeiro">Upgrade do plano →</Link></div><Link className="fcx-logout" href="/login">↳ Sair da sessão</Link></aside>
    <section className="fcx-main"><header className="fcx-top"><button>⌂ Academia Movimento <small>Unidade Matriz</small></button><label><span>⌕</span><input placeholder="Buscar alunos, treinos, exercícios ou recursos..."/><kbd>⌘ K</kbd></label><div><button>🔔<b>3</b></button><span className="fcx-user"><i>FL</i><strong>Fernando Lima<small>Gestor</small></strong></span><em>Gestor</em></div></header>
      <section className="fcx-welcome"><div><h1>Olá, Fernando! 👋</h1><p>Aqui está o panorama da sua academia hoje.</p></div><div className="fcx-tabs"><button className="active">▥ Gestor</button><button>♙ Professor</button><button>♙ Aluno</button></div><aside><span>Terça-feira, 9 de setembro de 2025</span><q>Mais que treinos, mais pessoas saudáveis.</q></aside></section>
      <section className="fcx-kpis">{dashboardKpis.map(([label, value, change, hint, icon]) => <article key={label}><i>{icon}</i><div><span>{label}</span><strong>{value}</strong><b>{change}</b><small>{hint}</small></div><em /></article>)}</section>
      <section className="fcx-grid-one"><article className="fcx-panel fcx-flow"><header><div><h2>Fluxo completo da sua operação</h2><p>Da estratégia à evolução, tudo em um só lugar.</p></div><Link href="/setup">Ver guia completo →</Link></header><div>{flow.map((item, index) => <Link href={["/onboarding","/equipe","/alunos","/treinos","/execucao","/evolucao"][index]} key={item}><i>{["▥","♙","●","▧","▶","▥"][index]}</i><strong>{index + 1}. {item}</strong><span>{["Configure e personalize","Gerencie sua equipe","Cadastre e acompanhe","Crie treinos personalizados","Acompanhe a realização","Analise resultados"][index]}</span><b>✓</b></Link>)}</div></article><FitCoreExactAgents /></section>
      <section className="fcx-grid-two"><article className="fcx-panel fcx-workout"><header><div><h2>Treino do dia <span>Visão do aluno</span></h2><p>Exemplo de treino em execução com demonstrações em vídeo (GIF).</p></div><Link href="/execucao">Ver treino completo →</Link></header><div>{exercises.map(([slug, name, muscles], index) => <article key={slug}><div><img src={`/media/exercises/${slug}.gif`} alt={name}/><button>▶</button><b>{index + 1}</b></div><strong>{name}</strong><span>{muscles}</span><small>4 x {index === 2 ? 12 : 10} repetições · Descanso: 60s</small><button>✓ Marcar como feito</button></article>)}</div></article><article className="fcx-panel fcx-pending"><header><h2>Pendências dos professores <b>5</b></h2><Link href="/relatorios">Ver todas →</Link></header>{pending.map((row) => { const [name, text, status] = row.split("|"); return <div key={name}><i>{name.slice(0,2)}</i><p><strong>{name}</strong><span>{text}</span></p><button>{status}</button></div>; })}</article><article className="fcx-panel fcx-library"><header><h2>Biblioteca de exercícios</h2><Link href="/biblioteca">Ver biblioteca →</Link></header><div>{exercises.map(([slug, name]) => <span key={slug}><img src={`/media/exercises/${slug}.gif`} alt={name}/><b>{name}</b><small>GIF · Próprio</small></span>)}</div><footer><b>+1.200</b><span>exercícios na biblioteca</span><b>98%</b><span>com demonstração em GIF</span></footer><Link href="/biblioteca">Gerenciar biblioteca →</Link></article></section>
      <section className="fcx-grid-three"><article className="fcx-panel"><header><h2>Evolução da sua academia</h2><nav><button>Últimos 6 meses</button><button>30 dias</button><button>7 dias</button></nav></header><div className="fcx-stat-row"><b>Esforço médio <strong>7,8 ↑ 12%</strong></b><b>Frequência semanal <strong>78% ↑ 6%</strong></b><b>Total de execuções <strong>4.892 ↑ 18%</strong></b></div></article><article className="fcx-panel fcx-chart"><h2>Progresso por treino</h2><div><i/><i/><i/><i/><i/><i/></div></article><article className="fcx-panel fcx-history"><header><h2>Histórico de execuções</h2><Link href="/relatorios">Ver relatório →</Link></header><table><tbody>{[["Academia Movimento","248","4.892","78%"],["Unidade Centro","156","2.843","72%"],["Unidade Zona Sul","92","1.204","68%"]].map(r=><tr key={r[0]}>{r.map(c=><td key={c}>{c}</td>)}</tr>)}</tbody></table></article></section>
    </section>
  </main>;
}

function FitCoreExactAgents() {
  return <article className="fcx-panel fcx-agents"><header><h2>✦ Agentes IA <span>BETA</span></h2><Link href="/agents">Ver todos →</Link></header><div className="fcx-agent-layout"><ul>{["Gerar plano de treino", "Analisar evolução de alunos", "Sugerir ajustes de carga", "Revisar execução de exercícios", "Tirar dúvidas instantâneas"].map(x => <li key={x}><b>{x}</b><span>Recomendações baseadas em dados</span><i>›</i></li>)}</ul><aside><div className="fcx-bot"><i/><b>FC</b></div><strong>Olá, Fernando!</strong><p>Como posso te ajudar hoje?</p><Link href="/agents">Conversar com a IA →</Link></aside></div></article>;
}
