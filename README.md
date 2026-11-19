# Esteja no Controle 2.0

Aplicativo financeiro pessoal da WA Digital Labs. Abra a prévia e use **Planejamento → Pagar parcela**, **Cartões → Pagar fatura** ou **Conexões financeiras → Conectar banco de teste**. Os valores de demonstração pertencem a este navegador. Em configurações é possível exportá-los ou apagá-los.

## Rodar e publicar

Use Node.js 24 e execute:

```sh
npm ci
npm test
npm run build
npx --yes serve dist
```

A pasta `dist/` contém o site estático completo para hospedagem HTTPS, inclusive autenticação empacotada e cache com versão por conteúdo. A pasta `v2/` também abre diretamente em um servidor estático no modo de demonstração. O endereço original do repositório continua atendendo a versão 1.0.24. A prévia usa a entrada nova.

Para gerar uma edição conectada, defina `ENC_V2_URL`, `ENC_V2_PUBLIC_KEY` (somente `sb_publishable_`) e `ENC_BUILD_ALLOWED_ORIGINS` com a origem exata do frontend antes do build. A Edge Function também aceita `ENC_ALLOWED_ORIGINS` no ambiente. O SDK de autenticação é servido na própria origem. Um usuário autenticado pode conferir ou exportar o cadastro anterior. A cópia para o livro 2.0 exige conferência e confirmação. O modo de demonstração continua disponível sem conta.

## Arquitetura

| Camada | Responsabilidade |
| --- | --- |
| `v2/domain/` | Quantias em centavos inteiros, datas civis, comandos validados, saldos, projeções, interpretação de perguntas e diferenças entre revisões. |
| `v2/ui/` | Navegação, formulários, resumo de cálculo, acessibilidade e gráficos. As telas consomem o mesmo motor dos testes. |
| `v2/open-finance/` | Contratos de leitura, dados sintéticos por escopo, candidatos à conciliação, aprovação e revogação. |
| `server/` | Validação de sessão, registro de provedores, processamento de comandos, leitura consistente de dados legados e sincronização. |
| `supabase/migrations/` | Persistência por titular e coleção, recibos de idempotência, revisão, RLS, cofre, fila com lease, políticas de vales e leitura do legado. |
| `scripts/` | Empacotamento do frontend, da função Deno e do service worker. |
| `tests/` | Testes de domínio e migração, permissões, falhas parciais, repetição, revisão concorrente e sincronização com PostgreSQL via PGlite. |

## Regras financeiras

- O saldo de uma conta é sua abertura mais as movimentações efetivadas até a data consultada. O resultado projetado considera o saldo da principal, receitas previstas e compromissos em aberto até o fim do mês, inclusive atrasados. A memória de cálculo detalha os componentes.
- Uma transferência própria reduz uma conta e aumenta outra. Aportes e resgates movem dinheiro entre posição e caixa. Esses movimentos preservam a separação entre renda, despesa e patrimônio.
- O patrimônio exibido é **bruto** e soma contas, posições e outros ativos. Vales têm razão e saldo próprios. A edição ou exclusão de um crédito avalia o saldo histórico da carteira.
- O valor integral de uma compra compromete o limite. O motor reparte centavos e preserva o dia de referência nos meses curtos. Uma compra no dia do fechamento pertence ao ciclo que fecha nesse dia. Pagar a fatura libera o principal liquidado e lança uma única saída. O saldo esperado protege pagamentos parciais contra uma tela antiga.
- A parcela tem identificador estável. Seu pagamento, o débito, a nova revisão e o recibo são confirmados na mesma transação. A próxima prestação é a primeira ainda em aberto. Parcelas de cartão são liquidadas pela fatura.
- O copiloto consulta o motor para saldo, comparação temporal, faturas, investimentos, margem para compras e projeção. A classificação complementar por modelo local depende de modelo de idioma já disponível no navegador. Perguntas sem cobertura mostram os temas suportados. O cliente trata números críticos de forma determinística.

## Banco, implantação e recuo

A Edge Function `finance-v2` verifica o bearer do usuário pela API Auth. A função usa o identificador devolvido por Auth como proprietário. O papel de serviço só existe no backend. O banco aceita as RPCs da versão 2 apenas desse papel. Um comando atrasado recebe conflito de revisão e a tela solicita atualização. A fila usa exclusão mútua, seis tentativas e atraso crescente. Cada página confirma seu cursor e o andamento do trabalho com as alterações financeiras.

O projeto hospedado já possui tabelas e migrações anteriores à história desta branch. Para um ambiente de teste novo, restaure primeiro o esquema legado ou use apenas a migração do livro e os testes isolados. Compare `supabase migration list` e a referência do projeto antes de publicar uma alteração. No projeto compartilhado, use somente as migrações correspondentes ao app. A migração do agendador contém a URL da instância alvo. Ajuste-a para outro ambiente. O build gera `supabase/functions/finance-v2/index.ts`. Publique a função com `supabase functions deploy finance-v2 --project-ref REF` depois de verificar o ambiente e a origem permitida.

A referência anterior do site é o commit `fbf7fead461a1c0eb4cccb05f1fd4739fb4c890b`. Para recuar a interface, sirva a versão anterior e preserve os registros criados na 2.0 para exportação. As definições anteriores das políticas otimizadas estão em `supabase/rollback/restore_benefit_policies.sql`. O job `enc-v2-sync-retry` pode ser desativado isoladamente. Não use `db reset` no projeto hospedado. Antes de uma migração em massa, valide uma restauração completa em ambiente separado.

## Privacidade e sincronização

A prévia privada publicada abre em demonstração. O saldo sincronizado é uma fotografia de conferência. O extrato importado entra em revisão e só afeta o razão quando o usuário o vincula ou confirma o lançamento. Compras legítimas com descrições e valores iguais permanecem distinguíveis. A conta equivalente do sandbox é selecionada no consentimento. A importação de uma segunda ponta de transferência pode ser vinculada ao movimento já registrado.

Em modo autenticado, o service worker só armazena o shell público. O navegador mantém os dados financeiros carregados em memória. Para editar o livro na nuvem é necessário estar online. Um erro de servidor é apresentado separadamente da perda da rede. A demonstração persiste no navegador e funciona offline após a primeira instalação completa.

[Auditoria, homologação e estado da entrega](docs/auditoria.md) · [Integração, consentimento e fontes oficiais](docs/open-finance.md)
