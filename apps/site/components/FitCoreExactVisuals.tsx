import Link from "next/link";
import { FitCoreThemeToggle } from "./FitCoreThemeToggle";
import { ProductShot } from "./FitCoreProductShots";

type IconName = "home" | "grid" | "users" | "user" | "dumbbell" | "clipboard" | "play" | "chart" | "shield" | "gear" | "bell" | "bot" | "calendar" | "wallet" | "search" | "logout" | "building" | "spark";

const iconPaths: Record<IconName, string[]> = {
  home: ["M3 10.5 12 3l9 7.5", "M5 10v10h14V10", "M9 20v-6h6v6"],
  grid: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  user: ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"],
  dumbbell: ["M6 7v10", "M18 7v10", "M3 9v6", "M21 9v6", "M6 12h12"],
  clipboard: ["M9 4h6", "M9 4a3 3 0 0 0 6 0", "M6 5h12v16H6z", "M9 11h6", "M9 15h6"],
  play: ["M8 5v14l11-7z"],
  chart: ["M4 19V5", "M4 19h17", "M8 16v-5", "M13 16V8", "M18 16v-9"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "M9 12l2 2 4-5"],
  gear: ["M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z", "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6l-.08.08a2 2 0 0 1-2.84 0L11 20a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1l-.08-.08a2 2 0 0 1 0-2.84L4 11a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6l.08-.08a2 2 0 0 1 2.84 0L13 4a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c0 .37.13.72.36 1l.08.08a2 2 0 0 1 0 2.84L19.76 13a1.7 1.7 0 0 0-.36 2z"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7", "M13.73 21a2 2 0 0 1-3.46 0"],
  bot: ["M8 11h8a4 4 0 0 1 4 4v2a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-2a4 4 0 0 1 4-4z", "M12 11V7", "M8 16h.01", "M16 16h.01"],
  calendar: ["M7 3v4", "M17 3v4", "M4 7h16", "M5 5h14v16H5z"],
  wallet: ["M3 6h16a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V6z", "M16 12h5v4h-5z"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16", "M21 21l-4.35-4.35"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  building: ["M3 21h18", "M5 21V5l7-3 7 3v16", "M9 9h1", "M14 9h1", "M9 13h1", "M14 13h1"],
  spark: ["M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2L12 2z"],
};

function Icon({ name }: { name: IconName }) {
  return <svg className="fcx-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">{iconPaths[name].map((d, i) => <path key={i} d={d} />)}</svg>;
}

const features: Array<[string, string, IconName, string, "business" | "team" | "students" | "workouts" | "execution" | "evolution"]> = [
  ["Criar negócio", "Configure academia, studio, box, personal ou consultório.", "chart", "/onboarding", "business"],
  ["Agenda e aulas", "Organize aulas, avaliações, retornos e capacidade.", "calendar", "/agenda", "evolution"],
  ["Equipe", "Gerencie dono, professores, nutri e permissões.", "users", "/equipe", "team"],
  ["Alunos e anamnese", "Cadastre objetivos, restrições, medidas e evolução.", "user", "/alunos", "students"],
  ["Treinos e nutrição", "Prescreva treinos, hábitos e orientação profissional.", "dumbbell", "/treinos", "workouts"],
  ["Execução e evolução", "Acompanhe GIFs, check-ins, progresso e retenção.", "play", "/execucao", "execution"],
];
const kpis = [["Alunos ativos", "124", "↑ 12%", "em relação ao mês anterior", "users"], ["Treinos executados", "892", "↑ 18%", "em relação ao mês anterior", "dumbbell"], ["Evolução média", "+28%", "", "nos últimos 3 meses", "chart"], ["Alunos em dia", "92%", "", "frequência nas últimas 4 semanas", "calendar"]] as const;
const dashboardKpis = [["Total de alunos", "248", "↑ 12%", "vs. mês anterior", "users"], ["Professores", "12", "↑ 20%", "vs. mês anterior", "users"], ["Treinos ativos", "892", "↑ 8%", "vs. mês anterior", "dumbbell"], ["Execuções hoje", "326", "↑ 18%", "vs. ontem", "play"], ["Frequência semanal", "78%", "↑ 6%", "vs. semana anterior", "chart"], ["Privacidade", "OK", "", "Acesso e auditoria", "shield"]] as const;
const flow = [["Negócio", "Configure e cresça seu negócio", "chart", "/onboarding"], ["Equipe", "Gerencie sua equipe", "users", "/equipe"], ["Alunos", "Cadastre e acompanhe", "user", "/alunos"], ["Prescrição", "Crie treinos personalizados", "clipboard", "/treinos"], ["Execução", "Acompanhe a realização", "play", "/execucao"], ["Evolução", "Analise resultados", "chart", "/evolucao"]] as const;
const exercises = [["0026-barbell-bench-squat", "Agachamento livre", "Pernas · Glúteos"], ["0289-dumbbell-bench-press", "Supino reto", "Peito · Tríceps"], ["0159-cable-decline-seated-wide-grip-row", "Remada sentada", "Costas · Bíceps"]] as const;
const pending = ["Carlos Almeida|Treino sem execução há 5 dias|Atenção", "Mariana Costa|Solicitou revisão de treino|Revisar", "Pedro Santos|Evolução abaixo do esperado|Atenção", "Juliana Ribeiro|Avaliação física pendente|Pendente", "Lucas Ferreira|Nova mensagem do aluno|Verificar"];

export function FitCoreExactLogo({ compact = false }: { compact?: boolean }) {
  return <span className={compact ? "fcx-logo is-compact" : "fcx-logo"}><b>FC</b></span>;
}

export function FitCoreExactLanding() {
  return <main className="fcx-public">
    <header className="fcx-public-nav">
      <Link href="/" className="fcx-brand"><FitCoreExactLogo /><span><strong>FitCore Pro</strong><small>Mais que treinos. Resultados.</small></span></Link>
      <nav><a href="#inicio">Início</a><a href="#funcionalidades">Soluções</a><a href="#planos">IA</a><a href="#seguranca">Segurança</a><a href="/dashboard">Demo</a></nav>
      <div className="fcx-nav-actions"><FitCoreThemeToggle /><Link href="/login">Entrar</Link><Link className="fcx-cta" href="/onboarding">Começar agora <span>→</span></Link></div>
    </header>
    <section className="fcx-hero" id="inicio">
      <div className="fcx-hero-copy">
        <span className="fcx-badge"><i />Fitness, educação física, nutrição esportiva e cross training</span>
        <h1>Gerencie sua operação fitness, <em>treinos, nutrição e evolução</em> em um só lugar.</h1>
        <p>Uma plataforma premium para academias, studios, boxes de cross training, personal trainers, nutrição esportiva e profissionais de educação física operarem com dados, IA e segurança.</p>
        <div className="fcx-actions"><Link className="fcx-cta" href="/onboarding">Começar gratuitamente <span>→</span></Link><Link className="fcx-secondary" href="/dashboard"><b>▶</b> Ver demonstração</Link></div>
        <div className="fcx-checks"><span>Agenda, aulas e avaliações</span><span>Treinos, nutrição e retenção</span><span>LGPD e acesso por perfil</span></div>
      </div>
      <FitCoreExactPreview />
    </section>
    <section className="fcx-feature-row" id="funcionalidades">{features.map(([title, text, icon, href, shot]) => <Link href={href} className="fcx-mini-card" key={title}><ProductShot kind={shot} title={title} /><i><Icon name={icon} /></i><strong>{title}</strong><p>{text}</p><span>→</span></Link>)}</section>
    <section className="fcx-lower-grid" id="planos"><article className="fcx-ai-banner"><span>NOVO</span><h2>Assistente IA para prescrição, evolução e retenção</h2><p>Crie treinos, ajuste cargas, acompanhe adesão, organize retornos e gere orientações com contexto do aluno, do professor e da unidade.</p><div className="fcx-agent-input"><div><b>✦</b><p>Olá, sou o assistente FitCore. Posso apoiar treino, nutrição esportiva, avaliação física, retenção e acompanhamento profissional.</p></div><form action="/agents"><input name="q" placeholder="Digite sua solicitação..."/><button>➤</button></form></div></article><article className="fcx-security-panel" id="seguranca"><i><Icon name="shield" /></i><h2>Seus dados, sempre protegidos</h2><p>Privacidade, controle de acesso por papel, registro de auditoria e operação preparada para LGPD em cada unidade.</p><ul><li><strong>LGPD</strong><span>Conformidade operacional</span></li><li><strong>Criptografia</strong><span>TLS 1.3</span></li><li><strong>Ambiente seguro</strong><span>Sessão, logs e backups</span></li></ul></article></section>
    <footer className="fcx-footer"><Link href="/" className="fcx-brand"><FitCoreExactLogo compact /><span><strong>FitCore Pro</strong><small>Operação fitness mais forte. Pessoas mais saudáveis.</small></span></Link><nav><a>Sobre</a><a>Soluções</a><a>Planos</a><a>Segurança</a><a>Contato</a></nav><span>Feito para quem transforma vidas. ♥</span></footer>
  </main>;
}

function FitCoreExactPreview() {
  return <aside className="fcx-preview"><div className="fcx-preview-inner"><div className="fcx-preview-side"><FitCoreExactLogo compact /><nav>{["Visão geral", "Alunos", "Treinos", "Execução", "Evolução", "Financeiro", "Equipe", "Relatórios"].map((item, index) => <span className={index === 0 ? "active" : ""} key={item}>{item}</span>)}</nav></div><div className="fcx-preview-main"><div className="fcx-preview-head"><div><strong>👋 Olá, Fernando</strong><small>Aqui está o resumo do seu negócio hoje.</small></div><span>Seg, 9 de set de 2026</span></div><div className="fcx-preview-kpis">{kpis.map(([label, value, change, hint, icon]) => <article key={label}><i><Icon name={icon} /></i><small>{label}</small><b>{value}</b>{change ? <em>{change}</em> : null}<span>{hint}</span></article>)}</div><div className="fcx-preview-body"><section><header><b>Evolução dos alunos</b><span>Últimos 8 meses⌄</span></header><div className="fcx-line"><i/><i/><i/><i/><i/><i/><i/></div></section><aside><b>Alunos em destaque</b>{["Camila Rocha  ↑ 32%", "Bruno Almeida  ↑ 28%", "Letícia Santos  ↑ 41%"].map(x => <span key={x}>{x}</span>)}</aside></div></div></div></aside>;
}

const sidebar = [["Visão geral", "home", "/dashboard"], ["Agenda", "calendar", "/agenda"], ["Assistente IA", "spark", "/agents"], ["Criar negócio", "spark", "/onboarding"], ["Equipe", "users", "/equipe"], ["Professores", "users", "/equipe"], ["Alunos", "users", "/alunos"], ["Biblioteca de exercícios", "grid", "/biblioteca"], ["Treinos", "dumbbell", "/treinos"], ["Prescrição", "clipboard", "/treinos"], ["Execução", "play", "/execucao"], ["Evolução", "chart", "/evolucao"], ["Financeiro", "wallet", "/financeiro"], ["Relatórios", "chart", "/relatorios"], ["Auditoria", "shield", "/auditoria"], ["Privacidade e LGPD", "shield", "/seguranca"], ["Configurações", "gear", "/configuracoes"]] as const;

export function FitCoreExactDashboard() {
  return <main className="fcx-console">
    <aside className="fcx-sidebar"><Link href="/dashboard" className="fcx-side-brand"><FitCoreExactLogo /><span><strong>FitCore Pro</strong><small>Gestão fitness inteligente</small></span></Link><nav>{sidebar.map(([name, icon, href], i) => <Link key={name} className={i === 0 ? "active" : ""} href={href}><Icon name={icon as IconName}/><span>{name}</span></Link>)}</nav><div className="fcx-upgrade"><Icon name="spark"/><strong>Seu negócio, mais forte</strong><p>Transforme vidas com tecnologia e dados.</p><Link href="/financeiro">Upgrade do plano →</Link></div><Link className="fcx-logout" href="/login"><Icon name="logout"/>Sair</Link></aside>
    <section className="fcx-main"><header className="fcx-top"><Link href="/configuracoes" className="fcx-unit"><Icon name="building"/><strong>Academia Movimento</strong><small>Unidade Matriz</small></Link><form action="/biblioteca"><Icon name="search"/><input name="q" placeholder="Buscar alunos, treinos, exercícios ou recursos..."/><kbd>⌘ K</kbd></form><div><FitCoreThemeToggle compact /><Link className="fcx-bell" href="/auditoria"><Icon name="bell"/><b>3</b></Link><Link className="fcx-user" href="/configuracoes"><i>FL</i><strong>Fernando Lima<small>Gestor</small></strong></Link><em>Gestor</em></div></header>
      <section className="fcx-welcome"><div><h1>Olá, Fernando! 👋</h1><p>Aqui está o panorama da sua operação fitness hoje.</p></div><div className="fcx-tabs"><Link className="active" href="/dashboard"><Icon name="chart"/>Gestor</Link><Link href="/treinos"><Icon name="users"/>Professor</Link><Link href="/execucao"><Icon name="user"/>Aluno</Link></div><aside><span>Terça-feira, 9 de setembro de 2025</span><q>Gestão, treino, nutrição, evolução e retenção em um fluxo seguro.</q></aside></section>
      <section className="fcx-kpis">{dashboardKpis.map(([label, value, change, hint, icon]) => <Link href={label.includes("Segurança") ? "/seguranca" : "/relatorios"} key={label}><i><Icon name={icon as IconName}/></i><span>{label}</span><strong>{value}</strong>{change ? <b>{change}</b> : null}<small>{hint}</small><em /></Link>)}</section>
      <section className="fcx-grid-one"><article className="fcx-panel fcx-flow"><header><div><h2>Fluxo completo da sua operação</h2><p>Da estratégia à evolução, tudo em um só lugar.</p></div><Link href="/setup">Ver guia completo →</Link></header><div>{flow.map(([item, text, icon, href], index) => <Link href={href} key={item}><i><Icon name={icon as IconName}/></i><strong>{index + 1}. {item}</strong><span>{text}</span><b>✓</b></Link>)}</div></article><FitCoreExactAgents /></section>
      <section className="fcx-grid-two"><article className="fcx-panel fcx-workout"><header><div><h2>Treino do dia <span>Visão do aluno</span></h2><p>Exemplo de treino em execução com demonstrações em vídeo (GIF).</p></div><Link href="/execucao">Ver treino completo →</Link></header><div>{exercises.map(([slug, name, muscles], index) => <article key={slug}><div><img src={`/media/exercises/${slug}.gif`} alt={name}/><Link href="/execucao">▶</Link><b>{index + 1}</b></div><strong>{name}</strong><span>{muscles}</span><small>4 x {index === 2 ? 12 : 10} repetições · Descanso: 60s</small><Link href="/execucao">✓ Marcar como feito</Link></article>)}</div></article><article className="fcx-panel fcx-pending"><header><h2>Pendências dos professores <b>5</b></h2><Link href="/relatorios">Ver todas →</Link></header>{pending.map((row) => { const [name, text, status] = row.split("|"); return <Link href="/relatorios" key={name}><i>{name.slice(0,2)}</i><p><strong>{name}</strong><span>{text}</span></p><button>{status}</button></Link>; })}</article><article className="fcx-panel fcx-library"><header><h2>Biblioteca de exercícios</h2><Link href="/biblioteca">Ver biblioteca →</Link></header><div>{exercises.map(([slug, name]) => <Link href="/biblioteca" key={slug}><img src={`/media/exercises/${slug}.gif`} alt={name}/><b>{name}</b><small>GIF · Próprio</small></Link>)}</div><footer><b>+1.200</b><span>exercícios na biblioteca</span><b>98%</b><span>com demonstração em GIF</span></footer><Link href="/biblioteca">Gerenciar biblioteca →</Link></article></section>
      <section className="fcx-grid-three"><article className="fcx-panel"><header><h2>Evolução da sua academia</h2><nav><button>Últimos 6 meses</button><button>30 dias</button><button>7 dias</button></nav></header><div className="fcx-stat-row"><b>Esforço médio <strong>7,8 ↑ 12%</strong></b><b>Frequência semanal <strong>78% ↑ 6%</strong></b><b>Total de execuções <strong>4.892 ↑ 18%</strong></b></div></article><article className="fcx-panel fcx-chart"><h2>Progresso por treino</h2><div><i/><i/><i/><i/><i/><i/></div></article><article className="fcx-panel fcx-history"><header><h2>Histórico de execuções</h2><Link href="/relatorios">Ver relatório →</Link></header><table><tbody>{[["Academia Movimento","248","4.892","78%"],["Unidade Centro","156","2.843","72%"],["Unidade Zona Sul","92","1.204","68%"]].map(r=><tr key={r[0]}>{r.map(c=><td key={c}>{c}</td>)}</tr>)}</tbody></table></article></section>
    </section>
  </main>;
}

function FitCoreExactAgents() { return <article className="fcx-panel fcx-agents"><header><h2><Icon name="spark"/>Agentes IA <span>BETA</span></h2><Link href="/agents">Ver todos →</Link></header><div className="fcx-agent-layout"><ul>{["Gerar plano de treino", "Analisar evolução de alunos", "Sugerir ajustes de carga", "Apoiar nutrição esportiva", "Revisar execução de exercícios", "Recuperar alunos inativos"].map(x => <li key={x}><Link href="/agents"><b>{x}</b><span>Recomendações baseadas em dados</span><i>›</i></Link></li>)}</ul><aside><div className="fcx-bot"><i/><b>FC</b></div><strong>Olá, Fernando!</strong><p>Como posso te ajudar hoje?</p><Link href="/agents">Conversar com a IA →</Link></aside></div></article>; }
