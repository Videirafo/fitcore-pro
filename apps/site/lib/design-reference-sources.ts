export type FitCoreDesignReference = {
  id: string;
  name: string;
  url: string;
  use: "REFERENCE" | "ADAPT";
  codeImport: "blocked" | "license-review";
  notes: string;
};

export const fitCoreDesignReferences: readonly FitCoreDesignReference[] = [
  { id: "startora-vibecoding-pinterest", name: "Startora — Pinterest de quem faz vibecoding", url: "https://startora.com.br/blog/o-pinterest-de-quem-faz-vibecoding", use: "REFERENCE", codeImport: "blocked", notes: "Usar como metodologia de descoberta e comparação; não copiar identidade ou código." },
  { id: "uiverse", name: "Uiverse", url: "https://uiverse.io", use: "ADAPT", codeImport: "license-review", notes: "Componentes só entram após revisão individual de licença, acessibilidade, mobile e bundle." },
  { id: "21st-dev", name: "21st.dev", url: "https://21st.dev", use: "ADAPT", codeImport: "license-review", notes: "Referência para padrões modernos; adaptar aos tokens FitCore." },
  { id: "react-bits", name: "React Bits", url: "https://reactbits.dev", use: "ADAPT", codeImport: "license-review", notes: "Motion seletivo, leve e com reduced-motion." },
  { id: "aceternity-ui", name: "Aceternity UI", url: "https://ui.aceternity.com", use: "REFERENCE", codeImport: "license-review", notes: "Inspiração de composição; evitar efeitos pesados em fluxo operacional." },
] as const;
