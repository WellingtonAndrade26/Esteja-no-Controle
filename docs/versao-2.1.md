# Esteja no Controle 2.1 — Autenticação e consolidação (primeira entrega)

## Implementado nesta branch

- Cadastro com e-mail, confirmação de senha e retorno para a mesma origem da aplicação.
- Resposta de cadastro diferente conforme a existência de uma sessão, sem afirmar que a conta foi confirmada.
- Solicitação de recuperação com mensagem genérica para não revelar se o e-mail existe.
- Captura do evento `PASSWORD_RECOVERY` e formulário de nova senha via `auth.updateUser`.
- Reconciliação da interface ao detectar sessão iniciada em outra aba.
- Separação do armazenamento de demonstração e do livro financeiro autenticado; nenhum dado de produção foi migrado.
- Novo módulo incluído no cache offline da prévia; testes do helper de autenticação e CI do motor financeiro.

## Antes da publicação

1. Configurar **Auth > URL Configuration** no projeto Supabase que hospeda o Esteja no Controle: URL do site correto e Redirect URLs explícitas para os endereços da prévia e da publicação (inclusive o caminho real do `index.html`). O aplicativo deriva o retorno de `location.origin + location.pathname`, sem receber URLs externas do formulário.
2. Confirmar o envio de e-mails de autenticação (SMTP e templates), confirmação de e-mail e comportamento de links expirados, de preferência em ambiente de homologação.
3. Ativar proteção de senha vazada em **Auth > Security and Protection**, se disponível no plano, e validar as regras de senha do projeto.
4. Testar: cadastro novo; confirmação por e-mail; conta já existente; senha divergente; recuperação de conta válida/inexistente; troca de senha; sessão expirada; saída; duas abas; PWA offline; preservação dos lançamentos na versão anterior.
5. Comparar o build publicado com a branch de desenvolvimento e inspecionar a identidade visual Prisma em desktop e mobile. Esta branch não substitui a publicação EC Glass atual.
6. Não executar `db reset` nem migrar ou apagar tabelas de usuários. Esta entrega **não inclui** qualquer migração SQL.

## Validação realizada

- 6 testes de unidade da autenticação usando o cliente Supabase simulado, sem envio de e-mail real.
- GitHub Actions `Esteja no Controle v2 checks`: `npm ci`, `npm test` e `npm run build`, com sucesso na branch.
- Advisor de saúde Supabase sem avisos na data de criação deste documento.
- Advisory de segurança do projeto compartilhado ainda indica proteção contra senhas vazadas desativada, além de funções `guide_*` com privilégios elevados acessíveis por API. Esses alertas devem ser tratados após análise das dependências de outros produtos; nenhuma política foi alterada aqui.

## Limites

Este código ainda exige homologação real de e-mail, configuração de URLs autorizadas e testes do fluxo de redirecionamento pelo navegador. O código não foi aplicado ao domínio oficial e nenhuma conta real foi criada para o teste.
