# Esteja no Controle — EC Glass 2.2 (Prisma)

## Objetivo

Cards de vidro translúcido, modulares e separados em todas as abas, com maior destaque para **Planejamento**.

## Base real

O site oficial `https://controle.wadigitallabs.com` está em Cloudflare Pages, projeto `esteja-no-controle-prisma`, com deploy **ad hoc** (publicação direta/ZIP), não a build da branch `main` deste repositório. Há diferenças significativas entre o código legado e a versão EC Glass publicada.

Os arquivos nesta pasta são um **patch auditável** sobre o frontend EC Glass recuperado, não um ZIP de produção completo. Não publicar esta pasta isoladamente nem fazer deploy do `dist` gerado pelo `npm run build` sobre a produção.

## Mudanças de apresentação

- `cards-prisma-v2.css`: override aditivo **após** `cards.css`; não altera Supabase, Auth, cálculo ou armazenamento.
- `index.html`: adiciona `cards-prisma-v2.css` após o CSS atual.
- `app.js`: muda apenas `<details class="plan-totals">` para `<details class="plan-totals" open>`, deixando o resumo de parcelas visível por padrão; mantém a opção de recolher.
- `sw.js`: preserva o tratamento offline e adiciona `./cards-prisma-v2.css` ao precache; muda o nome do cache para forçar atualização.

## Conteúdo afetado

- Visão geral: métricas e contêineres principais.
- Planejamento: elimina a regra que deixava transparente, sem borda e sem padding o primeiro painel; parcelamentos, resumos, recorrências e metas/limites antigos com cards individuais.
- Movimentações, contas, cartões, patrimônio, vales e IA: listas, cards de dados, botões e grupos com mesma família visual.
- Mobile: cards empilhados, espaçamento, blur mais leve, alvos clicáveis, foco visível e preferência por movimento reduzido.

## Procedimento seguro para prévia

1. Partir do **ZIP íntegro do último deploy oficial EC Glass**, incluindo todos os arquivos, módulos `ui/`, ícones, fontes e `access.js`.
2. Manter intactos os arquivos de Auth, configurações e dados do ZIP.
3. Copiar o novo `cards-prisma-v2.css` para a raiz do ZIP, ao lado de `cards.css`.
4. Inserir no `<head>` do `index.html`, depois do link existente de `cards.css`:

   `<link rel="stylesheet" href="./cards-prisma-v2.css">`

5. No `app.js` **da mesma versão oficial**, substituir SOMENTE a marcação da tag de resumo de parcelas, se existir de forma idêntica. Não trocar todo o `app.js` publicado pelo arquivo recuperado desta pasta sem antes conferir a versão.
6. Em `sw.js` da versão oficial, adicionar o novo CSS à lista de precache e trocar a versão do CACHE. Não substituir o service worker inteiro caso tenha mudado desde a extração.
7. Publicar **como preview isolada**, conferir visual (desktop e mobile), navegação, parcelas, cadastro/login, recuperação de senha, CRUD e sincronização; só então publicar no domínio oficial.
8. Limpar cache do PWA após a implantação, se necessário.

## Checklist obrigatório

- Os totais e as parcelas correspondem exatamente aos anteriores.
- Não há mudança em `localStorage`, IndexedDB, chaves Supabase, tabelas ou RLS.
- Login, saída, confirmação de e-mail e recuperação de senha continuam funcionando.
- Não existem cards sobrepostos, informações cortadas, listas sem borda ou valores escondidos na tela de Planejamento.
- As abas Resumo, Parcelas, Contas a pagar e Recorrências são navegáveis.
- Funciona em larguras 360px, 390px, 768px e desktop.
- Instalação PWA/offline sem recurso CSS 404.

## Status

**Desenvolvido e versionado na branch de proposta. Não publicado no site oficial.**

