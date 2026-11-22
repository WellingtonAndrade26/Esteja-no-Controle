# Integração segura do acesso Prisma — Esteja no Controle 2.1

## Origem verificada em 22/11/2026

- Cloudflare Pages: `esteja-no-controle-prisma`, domínio `https://controle.wadigitallabs.com/`.
- Último deploy consultado: `a886fbb3-c9f6-46fc-a5b2-f543124e9fe2`, concluído com sucesso em 21/11/2026.
- O último deploy é `ad_hoc` (envio manual), com mensagem `Fix: sair da demonstração e voltar ao cadastro`. **Não foi encontrado vínculo de publicação automática com a branch GitHub.**
- O HTML publicado referencia `styles.css`, `cards.css`, `access.js`, `app.js`, `config.js` e os assets personalizados EC/WA.
- A branch `feature/esteja-no-controle-2` tem uma interface anterior, sem `access.js` e sem `cards.css`. **Não usar o `dist/` dessa branch para substituir o deploy Prisma.**

## Problema demonstrado no JavaScript publicado

`access.js` solicita recuperação por `resetPasswordForEmail(email,{redirectTo:location.origin})`, mas não possui um fluxo para ouvir `PASSWORD_RECOVERY` e definir senha via `auth.updateUser`. Quando o link redireciona ao site, o visitante pode estar autenticado, porém sem receber o formulário de alteração.

## Entrega

Arquivo `prisma/access.js`: preserva o portão visual e a experiência de demonstração da produção e acrescenta:
- Captura de `PASSWORD_RECOVERY` antes de consultar a sessão;
- Tela de criação de nova senha (mínimo 8 caracteres e confirmação);
- Tratamento de link vencido ou inválido sem exibir tokens em mensagens;
- Mensagem neutra para solicitação de recuperação, mesmo quando o endereço não existe;
- Continuidade no app após trocar a senha com sucesso.

**Não é um site completo:** esse arquivo é a substituição pontual do `access.js` do pacote Prisma atualmente publicado. Não implantar sem os outros assets que pertencem à versão Prisma validada.

## Para homologar com o Supabase correto

1. Projeto `iyfknonepcarerlpcxlu` ativo. No painel Supabase: **Authentication > URL Configuration**. Validar `Site URL = https://controle.wadigitallabs.com/` e adicionar `https://controle.wadigitallabs.com/` às `Redirect URLs`. Incluir endereços de prévia somente se forem usados (e prefira URLs específicas).
2. Verificar SMTP/emails de confirmação e recuperação e o recebimento em uma conta de teste. Não usar a conta de um cliente para testes.
3. Verificar o aviso do Supabase de proteção contra senhas vazadas desativada em **Authentication > Security and Protection**. Ativar se a configuração estiver disponível no plano.
4. Na versão de homologação Prisma, conferir: cadastro confirmado, recuperação com link válido, expiração, senhas divergentes, confirmação e alteração efetiva, saída da conta, sair da demonstração, abertura em duas abas e PWA instalado.
5. Guardar uma cópia ZIP integral do último deploy Prisma antes de publicar, além de conferir na versão nova os cálculos, cartões, lançamentos, dados persistidos, assets e cards glass.

## Restrições

Nenhuma alteração nas tabelas ou nos dados dos usuários é necessária para o patch. O arquivo de produção foi lido de forma pública e não foi modificado na Cloudflare. O conector de Supabase disponível não permite alterar a configuração de URL do Auth, então ela continua **pendente de verificação no painel**. Os testes de código simulam o Supabase Auth; não substituem um envio real de e-mail.
