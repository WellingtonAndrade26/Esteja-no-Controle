# Conexões financeiras por instituição parceira

Referências verificadas em 19 de novembro de 2026. Este documento especifica o caminho entre o sandbox do Esteja no Controle e uma futura integração de leitura de dados de pessoa física. Os critérios de homologação abaixo precisam ser demonstrados com o parceiro contratado antes da ativação de bancos reais.

## Quem pode receber e compartilhar os dados

A instituição integradora é a participante que recebe os dados e, após a autorização do cliente, os transmite à entidade parceira. A WA Digital Labs pretende atuar como entidade parceira. Antes de contratar um agregador, identificar a integradora responsável, seu registro no diretório e como a WA aparecerá no contrato e para o cliente. A Resolução Conjunta 21/2026, publicada em 26/10/2026, alterou as regras de parceria da Resolução Conjunta 1/2020. A integradora deve avaliar a capacidade da potencial parceira e obter o atestado de auditor independente registrado na CVM. [Resolução Conjunta 21/2026](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=21&tipo=Resolu%C3%A7%C3%A3o+Conjunta) · [Síntese do Banco Central](https://www.bcb.gov.br/detalhenoticia/21313/noticia) · [Participantes do Open Finance](https://www.bcb.gov.br/meubc/faqs/p/os-bancos-e-instituicoes-que-participam-do-open-finance)

O contrato disciplina finalidade, responsabilidade, incidentes, encerramento e limites de uso. A vedação de repasse a terceiros abrange também os dados derivados que continuem identificando o cliente nas hipóteses abrangidas pela norma. Para o copilot financeiro, manter o cálculo e a interpretação desses dados dentro do ambiente aprovado. Impedir o envio de extratos, descrições, pseudônimos e totais por usuário a serviços externos de IA, analytics ou suporte. Um pseudônimo ainda pode permitir identificação. A integradora e os responsáveis pela privacidade devem avaliar cada prestador de infraestrutura, o país de tratamento e os instrumentos de transferência internacional aplicáveis antes de usar dados reais. [BCB, arts. 36–39, com a redação de 2026](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=21&tipo=Resolu%C3%A7%C3%A3o+Conjunta) · [Regulamento da ANPD para transferências internacionais](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados)

## Jornada do titular

| Etapa | Requisito para integração real |
| --- | --- |
| Conectar | Exibir a instituição, o nome da integradora, a identidade da entidade parceira, a finalidade e as classes de dados necessárias. Identificar demonstrações com dados sintéticos. |
| Autorizar | Encaminhar o titular ao ambiente da integradora para a autorização expressa e individual por entidade parceira. A autenticação no banco ocorre na jornada oficial do participante. O app nunca solicita senha bancária. |
| Voltar | Correlacionar o retorno ao titular e à tentativa iniciada. O backend consulta a integradora e verifica o status antes de autorizar a primeira sincronização. O retorno visual ao app por si só não comprova consentimento. |
| Gerenciar | Indicar banco, integradora, parceira, data, finalidade, dados autorizados, validade informada, status e última sincronização. Dar acesso permanente à gestão, inclusive depois da primeira sincronização. |
| Revogar | Bloquear imediatamente novas leituras e descartar respostas em trânsito. Solicitar revogação à integradora, acompanhar a confirmação e expor pendências de comunicação. Receber também as revogações feitas nos canais dos participantes. |
| Reconectar | Iniciar uma nova jornada oficial quando o consentimento expirar ou for revogado. Preservar a trilha de cada autorização e reconciliar registros já importados. |

O Manual de Experiência do Cliente v9 exige que o ambiente de gestão seja comunicado na efetivação do compartilhamento. Cada chamada deve respeitar os escopos, as permissões e os recursos do consentimento válido. A integradora define com as partes os perfis de autenticação e o mecanismo de notificação. [Manual de Experiência do Cliente, IN BCB 760/2026](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=760&tipo=Instru%C3%A7%C3%A3o+Normativa+BCB) · [Orientações da API de Consentimento](https://openfinancebrasil.atlassian.net/wiki/spaces/OF/pages/219480491) · [Perguntas e respostas do Banco Central](https://bcb.gov.br/meubc/faqs/s/open-finance)

## Fronteiras técnicas do adaptador

O backend traduz as respostas do provedor em contas, lançamentos, faturas, cartões, contratos de crédito e posições de investimento. O contrato interno deve manter identificadores de instituição, conexão e recurso, moeda, sinal e data próprios de cada evento. Saldo é uma posição com data de referência. Transação é uma movimentação. Uma posição não deve ser somada novamente aos lançamentos que já a compõem. Contas, investimentos e vales ocupam classes distintas no motor financeiro.

Para homologar um novo adaptador:

1. Mapear versões das APIs, capacidades, permissões, recursos disponíveis, paginação e limites. Registrar quais produtos a instituição oferece e quais foram efetivamente autorizados. Fixar as versões do parceiro identificadas em homologação. [APIs de dados e permissões](https://openfinancebrasil.atlassian.net/wiki/spaces/OF/pages/17369300/)
2. Registrar credenciais e chaves de cada ambiente no cofre do backend. Definir rotação, expiração e revogação dos segredos. Configurar endereços de retorno permitidos, autenticação das notificações e proteção contra repetição conforme o contrato. A participante aplica os perfis FAPI/OIDC e requisitos do ecossistema que lhe correspondem. A interface entre a WA e a integradora segue o perfil contratado. [Perfil de segurança do Open Finance Brasil](https://openfinancebrasil.atlassian.net/wiki/spaces/OF/pages/240648789) · [Manual de Segurança, IN BCB 720/2026](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=720&tipo=Instru%C3%A7%C3%A3o+Normativa+BCB)
3. Cobrir carga inicial e incremental, repetição de página, paginação interrompida, indisponibilidade, limite de requisições, revogação durante a leitura e reconexão com novo identificador. Persistir o cursor junto com o lote numa transação. Usar identificadores estáveis e escopo por titular, instituição e recurso. Em correspondências incertas, submeter a decisão ao titular antes de afetar o saldo.
4. Testar separação entre titulares, consentimento parcial e alteração do conjunto de recursos permitidos. Registrar apenas evento, referência interna, resultado, duração e contador necessários ao diagnóstico. Excluir corpos de resposta, valores de extrato, tokens e identificadores bancários dos logs.
5. Conduzir a homologação de ponta a ponta com credenciais do ambiente próprio do parceiro. Conferir consentimento nos dois lados, cancelamento iniciado em cada canal, bloqueio de importações e correção do extrato após falhas. O sandbox sintético do app permite desenvolver essas rotinas e é distinto da homologação da integradora.

## Retenção, histórico e exclusão

| Dado | Tratamento a definir no contrato e implementar antes da produção |
| --- | --- |
| Credenciais da conexão | Bloquear o uso ao revogar ou expirar. Invalidar na integradora e eliminar as credenciais dispensáveis do cofre. |
| Extrato importado e projeções identificáveis | Marcar a conexão revogada e preservar a distinção entre registros importados e registros criados pelo titular. Avaliar o término da finalidade e executar a eliminação devida, inclusive dos derivados. A retenção de cada eventual exceção exige fundamento documentado, prazo e controle de acesso. |
| Lançamento manual conciliado | Preservar a autoria manual. Na exclusão da origem bancária, remover referências e metadados importados e recalcular os totais afetados. |
| Evidências de consentimento e revogação | Minimizar identificadores, limitar acesso, registrar fundamento e prazo validados pela integradora para a categoria e expurgar ao final. |
| Cópias de segurança | Documentar janela de expiração e como as exclusões serão reaplicadas antes de disponibilizar dados restaurados. |

Revogar suspende o acesso futuro imediatamente. O novo art. 36, § 7º determina que o tratamento dure pelo tempo necessário à finalidade informada e prevê eliminação quando ela terminar, em conformidade com a legislação de proteção de dados. Antes do piloto real, definir quem recebe pedidos do titular, como atende acesso, correção, exportação e exclusão, quais exceções legais se aplicam, e o prazo de execução e comprovação por categoria. Registrar esse acordo no aviso de privacidade. A configuração financeira do usuário e os registros de origem manual exigem avaliação própria. [Resolução Conjunta 21/2026](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=21&tipo=Resolu%C3%A7%C3%A3o+Conjunta) · [LGPD, arts. 6º, 15, 16, 18, 33 e 46](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)

## Critério de ativação

A ativação exige integradora identificada, contrato, avaliação da potencial parceira, política de retenção aprovada, fluxo de atendimento definido, adaptador real homologado e evidências dos testes acima. A WA e a integradora devem conferir a regulamentação e as versões das APIs vigentes na data de lançamento. Até lá, a apresentação ao usuário deve identificar cada conexão de demonstração e a origem sintética de seus dados.
