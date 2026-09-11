import type { Metadata } from "next";

export const metadata: Metadata = { title: "Open source | FitCore" };

export default function Page() {
  return <>
    <span className="fitcore-legal-eyebrow">Open source</span>
    <h1>Software e componentes abertos</h1>
    <p>O FitCore utiliza e estuda componentes open source como parte da sua arquitetura. Cada integração deve respeitar a licença, atribuições e obrigações aplicáveis.</p>
    <h2>wger</h2>
    <p>O ecossistema wger é utilizado como referência e base fitness interna. As obrigações da licença aplicável devem ser revisadas em cada forma de distribuição e operação comercial.</p>
    <h2>Aplicativo mobile</h2>
    <p>Dependências Flutter e demais bibliotecas permanecem sujeitas às respectivas licenças. O produto não deve incorporar código, assets ou marcas de terceiros sem compatibilidade validada.</p>
    <p className="fitcore-legal-note">Este documento não substitui o inventário de dependências, NOTICEs e análise de licença mantidos no repositório.</p>
  </>;
}
