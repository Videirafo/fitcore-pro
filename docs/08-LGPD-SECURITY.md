# 08 - LGPD e Segurança

## Decisão

O FitCore Pro deve evoluir como produto fitness com proteção de dados desde a base. Dados de aluno, treino, avaliação, medidas, fotos de evolução, frequência e histórico podem envolver privacidade elevada e, em alguns contextos, dados sensíveis.

## Regra de produto

A vitrine pública deve falar de valor para academia, studio, personal trainer e aluno. Informações técnicas e licenças ficam nas páginas legais e na documentação.

## Páginas legais públicas

Rotas adicionadas:

```txt
/legal/privacy
/legal/security
/legal/terms
/legal/open-source
```

## Baseline LGPD

- Informar finalidade do tratamento.
- Coletar apenas dados necessários.
- Definir papéis de acesso: gestor, professor, aluno e suporte.
- Permitir canal de solicitação do titular.
- Evitar exposição de dados sensíveis em logs.
- Registrar operações sensíveis.
- Revisar integrações antes de enviar dados para terceiros.

## Baseline de segurança

- HTTPS obrigatório.
- Portas internas não expostas publicamente.
- Segredos fora do GitHub.
- Senhas padrão removidas.
- Backup e restore testados antes de cliente real.
- Auditoria para operações sensíveis.
- Política de mídia externa: não servir imagens/GIFs de terceiros sem licença validada.

## Próximos passos

1. Criar cadastro de aluno com consentimento e finalidade clara.
2. Criar papéis e permissões.
3. Criar painel de solicitações LGPD.
4. Criar logs de auditoria.
5. Criar política de retenção e exclusão.
6. Validar com revisão jurídica antes de venda pública.
