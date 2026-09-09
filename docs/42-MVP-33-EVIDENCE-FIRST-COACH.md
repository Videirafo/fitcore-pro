# MVP-33 — Evidence-First Coach

Issue: #1.

O Coach do FitCore usa somente dados já autorizados da unidade e do aluno. Ele não cria uma fonte de verdade paralela e não altera treino automaticamente.

Pipeline: `Student Evolution -> Context Pack -> Feedback Quality -> Recommendations -> Human Review`.

Contratos principais:
- contexto com proveniência e contagem de evidências;
- confiança baixa/média/alta baseada no volume observável;
- dados ausentes aparecem explicitamente;
- recomendações de aderência, revisão de esforço e progressão gradual;
- nenhuma ação clínica, diagnóstico ou mudança sensível autônoma;
- aluno vê apenas o próprio contexto; professor/gestor só veem o escopo permitido da unidade.

Superfícies: `/coach`, `/api/mvp-33/brief`, `/api/mvp-33/my-coach`, `/api/mvp-33/students/:id/coach`.
