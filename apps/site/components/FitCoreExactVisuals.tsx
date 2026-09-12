import Link from "next/link";
import { FitCoreThemeToggle } from "./FitCoreThemeToggle";
import { FitCoreBrandLockup, FitCoreBrandSymbol } from "./FitCoreBrandSymbol";

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

const features: Array<[string, string, IconName, string]> = [
  ["Criar negócio", "Configure academia, studio, box, personal ou consultório.", "chart", "/cadastro"],
  ["Agenda e aulas", "Organize aulas, avaliações, retornos e capacidade.", "calendar", "/agenda"],
  ["Equipe", "Gerencie dono, professores, nutri e permissões.", "users", "/equipe"],
  ["Alunos e anamnese", "Cadastre objetivos, restrições, medidas e evolução.", "user", "/alunos"],
  ["Treinos e nutrição", "Prescreva treinos, hábitos e orientação profissional.", "dumbbell", "/treinos"],
  ["Execução e evolução", "Acompanhe GIFs, check-ins, progresso e retenção.", "play", "/execucao"],
];
const kpis = [["Alunos ativos", "124", "↑ 12%", "em relação ao mês anterior", "users"], ["Treinos executados", "892", "↑ 18%", "em relação ao mês anterior", "dumbbell"], ["Evolução média", "+28%", "", "nos últimos 3 meses", "chart"], ["Alunos em dia", "92%", "", "frequência nas últimas 4 semanas", "calendar"]] as const;

export function FitCoreExactLogo({ compact = false }: { compact?: boolean }) {
  return <FitCoreBrandSymbol compact={compact} className="fcx-logo" />;
}

export function FitCoreExactLanding() {
  return <main className="fcx-public">
    <header className="fcx-public-nav">
      <Link href="/" className="fcx-brand fcx-brand-official"><FitCoreBrandLockup className="fcx-header-lockup" /></Link>
      <nav><a href="#inicio">Início</a><a href="#funcionalidades">Soluções</a><a href="#planos">IA</a><a href="#seguranca">Segurança</a><a href="/dashboard">Demo</a></nav>
      <div className="fcx-nav-actions"><FitCoreThemeToggle /><Link href="/login">Entrar</Link><Link className="fcx-cta" href="/cadastro">Começar agora <span>→</span></Link><details className="fcx-mobile-menu"><summary aria-label="Abrir menu"><span /><span /><span /></summary><div><a href="#inicio">Início</a><a href="#funcionalidades">Soluções</a><a href="#planos">IA</a><a href="#seguranca">Segurança</a><Link href="/dashboard">Demo</Link><Link href="/login">Entrar</Link><Link className="fcx-mobile-menu-cta" href="/cadastro">Começar agora →</Link></div></details></div>
    </header>
    <section className="fcx-hero" id="inicio">
      <div className="fcx-hero-copy">
        <span className="fcx-badge"><i />Fitness, educação física, nutrição esportiva e cross training</span>
        <h1>Gerencie sua operação fitness, <em>treinos, nutrição e evolução</em> em um só lugar.</h1>
        <p>Uma plataforma premium para academias, studios, boxes de cross training, personal trainers, nutrição esportiva e profissionais de educação física operarem com dados, IA e segurança.</p>
        <div className="fcx-actions"><Link className="fcx-cta" href="/cadastro">Começar gratuitamente <span>→</span></Link><Link className="fcx-secondary" href="/dashboard"><b>▶</b> Ver demonstração</Link></div>
        <div className="fcx-checks"><span>Agenda, aulas e avaliações</span><span>Treinos, nutrição e retenção</span><span>LGPD e acesso por perfil</span></div>
      </div>
      <FitCoreExactPreview />
    </section>
    <section className="fcx-feature-row" id="funcionalidades">{features.map(([title, text, icon, href]) => <Link href={href} className="fcx-mini-card" key={title}><i><Icon name={icon} /></i><strong>{title}</strong><p>{text}</p><span>→</span></Link>)}</section>
    <section className="fcx-lower-grid" id="planos"><article className="fcx-ai-banner"><span>NOVO</span><h2>Assistente IA para prescrição, evolução e retenção</h2><p>Crie treinos, ajuste cargas, acompanhe adesão, organize retornos e gere orientações com contexto do aluno, do professor e da unidade.</p><div className="fcx-agent-input"><div><b>✦</b><p>Olá, sou o assistente FitCore. Posso apoiar treino, nutrição esportiva, avaliação física, retenção e acompanhamento profissional.</p></div><form action="/agents"><input name="q" placeholder="Digite sua solicitação..."/><button>➤</button></form></div></article><article className="fcx-security-panel" id="seguranca"><i><Icon name="shield" /></i><h2>Seus dados, sempre protegidos</h2><p>Privacidade, controle de acesso por papel, registro de auditoria e operação preparada para LGPD em cada unidade.</p><ul><li><strong>LGPD</strong><span>Conformidade operacional</span></li><li><strong>Criptografia</strong><span>TLS 1.3</span></li><li><strong>Ambiente seguro</strong><span>Sessão, logs e backups</span></li></ul></article></section>
    <footer className="fcx-footer"><Link href="/" className="fcx-brand fcx-brand-official"><FitCoreBrandLockup compact className="fcx-footer-lockup" /></Link><nav><a>Sobre</a><a>Soluções</a><a>Planos</a><a>Segurança</a><a>Contato</a></nav><span>Feito para quem transforma vidas. ♥</span></footer>
  </main>;
}

function FitCoreExactPreview() {
  return <aside className="fcx-preview"><div className="fcx-preview-inner"><div className="fcx-preview-side"><FitCoreExactLogo compact /><nav>{["Visão geral", "Alunos", "Treinos", "Execução", "Evolução", "Financeiro", "Equipe", "Relatórios"].map((item, index) => <span className={index === 0 ? "active" : ""} key={item}>{item}</span>)}</nav></div><div className="fcx-preview-main"><div className="fcx-preview-head"><div><strong>👋 Olá, Fernando</strong><small>Aqui está o resumo do seu negócio hoje.</small></div><span>Seg, 9 de set de 2026</span></div><div className="fcx-preview-kpis">{kpis.map(([label, value, change, hint, icon]) => <article key={label}><i><Icon name={icon} /></i><small>{label}</small><b>{value}</b>{change ? <em>{change}</em> : null}<span>{hint}</span></article>)}</div><div className="fcx-preview-body"><section><header><b>Evolução dos alunos</b><span>Últimos 8 meses⌄</span></header><div className="fcx-line"><i/><i/><i/><i/><i/><i/><i/></div></section><aside><b>Alunos em destaque</b>{["Camila Rocha  ↑ 32%", "Bruno Almeida  ↑ 28%", "Letícia Santos  ↑ 41%"].map(x => <span key={x}>{x}</span>)}</aside></div></div></div></aside>;
}
