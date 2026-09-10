import Link from "next/link";
import { FitCoreProductModules } from "./FitCoreProductModules";
import { BusinessVisual, EvolutionVisual, ExecutionVisual, FitCoreBrandMark, StudentsVisual, TeamVisual, WorkoutsVisual } from "./FitCoreVisuals";

const features = [
  { title: "Criar negócio", text: "Configure academia, estúdio, box ou personal e avance para o setup guiado.", Visual: BusinessVisual },
  { title: "Equipe", text: "Gerencie dono, professores e alunos com permissões por papel.", Visual: TeamVisual },
  { title: "Alunos", text: "Cadastre objetivos, nível, frequência semanal e responsável técnico.", Visual: StudentsVisual },
  { title: "Treinos", text: "Prescreva, revise e libere treinos com apoio visual e inteligência operacional.", Visual: WorkoutsVisual },
  { title: "Execução", text: "Aluno inicia, marca exercícios, registra esforço e conclui sem sair da sessão.", Visual: ExecutionVisual },
  { title: "Evolução", text: "Acompanhe histórico, frequência, esforço médio e progresso por aluno.", Visual: EvolutionVisual },
];

const exercises = [
  ["0024-barbell-bench-front-squat", "Agachamento frontal", "Quadríceps · Glúteos · Core"],
  ["0150-cable-bar-lateral-pulldown", "Puxada alta", "Costas · Bíceps"],
  ["0289-dumbbell-bench-press", "Supino com halteres", "Peitoral · Ombros · Tríceps"],
];

export function FitCorePublicLanding() {
  return <main className="landing-shell">
    <header className="landing-nav">
      <Link href="/" className="landing-brand"><FitCoreBrandMark /><div><strong>FitCore Pro</strong><small>Mais que treinos. Resultados.</small></div></Link>
      <nav><a href="#funcionalidades">Funcionalidades</a><a href="#operacao">Operação</a><a href="#ia">IA</a><a href="#seguranca">Segurança</a><a href="#demo">Demo</a></nav>
      <div><Link className="button secondary" href="/login">Entrar</Link><Link className="primary-pill" href="/onboarding">Começar agora</Link></div>
    </header>

    <section className="landing-hero" id="demo">
      <div className="landing-copy">
        <span className="landing-badge">● Plataforma completa para profissionais de fitness</span>
        <h1>Gerencie seus alunos, <em>treinos e evolução</em> em um só lugar.</h1>
        <p>O FitCore Pro une cadastro, prescrição, execução com GIFs, IA para profissionais, evolução e LGPD em uma operação organizada para dono, professor e aluno.</p>
        <div className="landing-actions"><Link className="primary-pill" href="/onboarding">Começar gratuitamente →</Link><Link className="button secondary" href="/login">Entrar no sistema</Link></div>
        <div className="landing-checks"><span>Setup em minutos</span><span>Sem cartão de crédito</span><span>Suporte em português</span></div>
      </div>

      <aside className="landing-product-preview" aria-label="Prévia do sistema FitCore">
        <div className="preview-header"><strong>FitCore Pro</strong><span>Olá, Fernando</span></div>
        <div className="preview-kpis"><article><small>Alunos ativos</small><b>124</b><em>↑ 12%</em></article><article><small>Treinos executados</small><b>892</b><em>↑ 18%</em></article><article><small>Evolução média</small><b>+28%</b><em>3 meses</em></article><article><small>Alunos em dia</small><b>92%</b><em>4 semanas</em></article></div>
        <div className="preview-chart"><i style={{height:"32%"}}/><i style={{height:"45%"}}/><i style={{height:"53%"}}/><i style={{height:"64%"}}/><i style={{height:"76%"}}/><i style={{height:"88%"}}/></div>
        <div className="preview-list"><strong>Alunos em destaque</strong><span>Camila Rocha · +32%</span><span>Bruno Almeida · +28%</span><span>Letícia Santos · +41%</span></div>
      </aside>
    </section>

    <section className="landing-feature-grid professional-feature-grid" id="funcionalidades">{features.map(({ title, text, Visual }) => <article key={title} className="professional-feature-card"><Visual /><div><strong>{title}</strong><p>{text}</p></div><span>→</span></article>)}</section>

    <FitCoreProductModules />

    <section className="landing-split" id="ia">
      <article className="landing-ai-card"><span>Novo</span><h2>Assistente IA para prescrição e acompanhamento</h2><p>Ajude profissionais a criar treinos, ajustar carga, revisar evolução, explicar exercícios e orientar alunos com base no contexto da unidade.</p><div className="agent-answer"><strong>Olá, sou o assistente FitCore.</strong><p>Posso criar um treino para hipertrofia, ajustar carga do aluno ou analisar a evolução. O que você precisa?</p></div></article>
      <article className="landing-security" id="seguranca"><h2>Seus dados, sempre protegidos</h2><p>Sessão assinada, permissões por papel, auditoria por unidade, cookies seguros, rate limit e princípios de LGPD desde a operação inicial.</p><div><span>LGPD</span><span>Dados protegidos</span><span>Auditoria</span></div></article>
    </section>

    <section className="landing-exercises"><div><span className="eyebrow">Treinos com mídia</span><h2>GIFs internos mostram exatamente o que fazer.</h2><p>Cada exercício carrega demonstração, músculos trabalhados, séries, descanso e orientação técnica.</p></div><div className="landing-exercise-list">{exercises.map(([slug, name, muscles], index) => <article key={slug}><img src={`/media/exercises/${slug}.gif`} alt={`Demonstração de ${name}`} /><b>{index + 1}</b><strong>{name}</strong><span>{muscles}</span></article>)}</div></section>

    <footer className="landing-footer"><strong>FitCore Pro</strong><nav><Link href="/seguranca">Segurança</Link><Link href="/login">Login</Link><Link href="/onboarding">Criar negócio</Link></nav><span>Feito para quem transforma vidas.</span></footer>
  </main>;
}
