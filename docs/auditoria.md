# Auditoria de 19 de novembro de 2026

A base de partida foi o commit `fbf7fea`, versão 1.0.24. Foram lidos o repositório, o catálogo PostgreSQL, as políticas, os metadados de triggers e RPCs, as funções existentes de IA e exclusão e os três advisors. A inspeção do catálogo foi feita sem consultar movimentações de clientes.

| Achado | Tratamento na versão 2 |
| --- | --- |
| A configuração 1.0.24 carrega nove scripts complementares. A tela de resumo refazia contas e sobrescrevia o DOM. | Entrada própria em módulos. Um motor financeiro atende painel, planejamento, copiloto e testes. Os scripts anteriores ficam na rota clássica para continuidade. |
| A conta guarda saldo materializado. Transferir e pagar fatura envolviam várias requisições. | Um comando persistido sob revisão confirma os registros e o recibo de uma só vez. |
| Uma compra parcelada podia coexistir com itens de fatura e parcelamento espelho. | O cartão tem um único cronograma de faturas. A conversão ignora o espelho de cartão e verifica pagamentos e limite utilizado. |
| O carregamento antigo limitava extratos e compras a 1.000 registros. | A conferência lê as tabelas financeiras do titular em uma fotografia consistente. O extrato da interface abre em lotes de 30. O snapshot do livro pessoal completo em memória continua sendo um limite de escalabilidade a medir com perfis volumosos. |
| O service worker anterior limpava todos os caches da origem e gravava navegações sob a chave do index. | O service worker 2.0 limita a limpeza ao escopo da própria versão e guarda somente arquivos empacotados. |
| O backend compartilha autenticação com outros produtos. | As relações e funções novas usam o prefixo enc_. A exclusão da versão 2 é específica do livro financeiro. A rota clássica de encerramento de identidade requer avaliação antes de encerrar uma conta compartilhada. |

## Verificações na instância

A leitura inicial mostrou 33 tabelas públicas com RLS ativo e nenhum bucket de storage. As tabelas financeiras examinadas restringem acesso por proprietário. A função de IA existente usa um serviço externo. A 2.0 interpreta os dados no dispositivo. As oito políticas de vales que recalculavam auth.uid() por linha foram ajustadas e o aviso desapareceu no advisor de desempenho. Os testes em PostgreSQL verificaram a leitura do próprio titular e a recusa de gravação com outro proprietário.

Foram verificadas seis tabelas novas protegidas por RLS, zero RPCs enc_ executáveis diretamente por anon ou authenticated, a fila de retentativas ativa e resposta HTTP 401 da Edge Function a uma leitura sem autenticação. O preflight da origem da prévia retornou HTTP 204. Os advisors continuaram apontando a proteção contra senhas vazadas no Auth compartilhado e achados de outros módulos. O advisor de saúde retornou zero avisos. [Proteção de senhas no Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) · [Custo das verificações RLS por linha](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)

## Evidência e alcance

Os testes incluem o resultado de R$ 1.000 com R$ 5.000 investidos, transferência entre contas, aporte/resgate, pagamento parcial e integral da fatura, limites, vales, centavos, anos bissextos, repetição de comandos, rollback após falha intermediária, conflitos de revisão, negação de acesso direto, bloqueio de importação divergente, expiração/revogação do consentimento, direitos do titular e conciliação de duas pontas. O teste do navegador localizou a correspondência entre Mercado e SUPERMERCADO HORIZONTE, ambos de R$ 361. Sete telas foram medidas a 320, 360, 390, 768 e 1280 pixels, sem rolagem horizontal nas 35 combinações.

A prévia pública do código usa dados sintéticos locais. A edição de demonstração publicada com acesso privado pode ser explorada sem introduzir dados pessoais. A implantação de backend separada inclui o livro, a conferência do legado, o agendador e a otimização de vales. A migração posterior enc_erase_revision e o bundle correspondente precisam ser conferidos na instância antes de abrir a versão autenticada a clientes.

A importação de contas reais é opt-in, pontual e exige um livro 2.0 vazio. Metas, orçamentos e dívidas antigas permanecem disponíveis na versão clássica e na exportação do titular. A revisão barra inconsistências nos limites, valores de parcelas, débitos de fatura e saldos de vale. O histórico antigo de investimentos sem posições datadas começa com o valor conhecido na data da cópia. Não foi realizado teste de login com credenciais de um cliente, cópia em massa de históricos, restauração de backup de produção, homologação com uma instituição, teste em aparelho físico ou transação bancária real.
