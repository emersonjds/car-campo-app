# Viabilidade: Hub de Documentos Digitais do Imóvel Rural

**Data:** 2026-06-28
**Contexto:** CAR Campo — tela de documentos do produtor (visão "dono da terra").
**Questão respondida:** "É possível centralizar, mostrar status e compartilhar todos os documentos digitais de um imóvel rural — com as ferramentas que existem hoje no CAR?"

---

## 1. Documentos digitais reais disponíveis hoje

| # | Documento | Nome oficial | Órgão/Sistema | Onde obter | Formato | Autenticação |
|---|---|---|---|---|---|---|
| 1 | **Recibo do CAR** | Recibo de Inscrição no CAR | SICAR (MMA) | [Meu Imóvel Rural](https://www.gov.br/pt-br/servicos/baixar-documentos-do-car-cadastro-ambiental-rural-pela-plataforma-meu-imovel-rural) — portal + app iOS/Android | PDF | Login gov.br (Bronze/Prata/Ouro) |
| 2 | **Extrato do CAR** | Extrato/Demonstrativo do CAR | SICAR (MMA) | [Meu Imóvel Rural](https://www.gov.br/gestao/pt-br/assuntos/meu-imovel-rural) | PDF | Login gov.br |
| 3 | **CCIR** | Certificado de Cadastro de Imóvel Rural | SNCR / SERPRO / INCRA | [sncr.serpro.gov.br/ccir/emissao](https://sncr.serpro.gov.br/ccir/) — ou via gov.br/incra | PDF (após pagamento de taxa ~R$5,65) | CPF + nº NIRF (consulta no SNCR, sem login gov.br obrigatório) |
| 4 | **Planta + Memorial Descritivo (SIGEF)** | Certidão de Georreferenciamento | SIGEF / INCRA | [sigef.incra.gov.br](https://sigef.incra.gov.br/) — gerada automaticamente pós-certificação; também via Meu Imóvel Rural | PDF | Técnico: certificado digital A1/A3. Dono: login gov.br ou acesso direto SIGEF |
| 5 | **Matrícula** | Certidão de Inteiro Teor da Matrícula | Cartório de Registro de Imóveis | [e-Notariado](https://www.e-notariado.org.br/) / ONR (em digitalização progressiva por UF) | PDF | Login e-Notariado (CPF) — pago |
| 6 | **CAF** | Extrato do Cadastro Nacional da Agricultura Familiar | MDA | [caf.mda.gov.br](https://caf.mda.gov.br/) | PDF/extrato digital | Login gov.br |
| 7 | **Comprovante DITR / CAFIR** | Recibo de Entrega da DITR + Comprovante CAFIR | Receita Federal | [servicos.receita.fazenda.gov.br/extratoitr](https://servicos.receita.fazenda.gov.br/servicos/extratoitr/default.asp) / e-CAC | PDF | Login gov.br / e-CAC (Prata ou Ouro) |
| 8 | **Licença Ambiental** (LP/LI/LO) | Licença Prévia, de Instalação ou de Operação | Órgão ambiental estadual (SEMA, IAT, CETESB...) | Portal do órgão estadual (varia por UF) | PDF | Login no portal estadual (sem padrão nacional) |
| 9 | **Outorga de água** | Outorga de Direito de Uso de Recursos Hídricos | ANA (federal) ou CERH estadual | Portal da ANA ou do órgão estadual | PDF | Login no portal do órgão (sem padrão nacional) |

**Nota sobre Meu Imóvel Rural:** lançado em julho/2025, integra SICAR + SNCR + SIGEF + CAF em ambiente único. App disponível na [App Store](https://apps.apple.com/br/app/meu-im%C3%B3vel-rural/id6745718205) e Google Play. É o ponto de convergência mais próximo da visão do dono — mas o acesso é manual (login gov.br do próprio produtor).

---

## 2. Validade e regra de renovação

| Documento | Validade | O que define "em dia" | Permanente? |
|---|---|---|---|
| Recibo do CAR | Permanente após inscrição aceita | Status "Ativo" no SICAR; vira pendente/suspenso se houver problemas | Sim — não expira, mas reflete situação atual |
| Extrato do CAR | Snapshot da data de emissão | Idem — o conteúdo muda quando o imóvel é retificado | Dinâmico — reemitir após retificação |
| CCIR | **1 ano** — exercício fiscal anual | Emitido novo a cada exercício (janela: ~junho–julho pelo INCRA); o anterior perde validade | Não — renovar todo ano |
| Planta/Memorial SIGEF | **Permanente** após certificação INCRA | Certificado não expira, mas perde validade operacional se o imóvel for subdividido/alterado | Sim (salvo alteração de perímetro) |
| Matrícula | Permanente (ato jurídico registral) | Certidão tem prazo de validade para crédito (~30–90 dias conforme banco); o ato em si é permanente | Ato sim; certidão tem prazo |
| CAF | **3 anos** (Sul/SE/CO/NE) ou **5 anos** (Norte) — CAF 3.0 (março/2025) | Declaração ativa e dentro do prazo | Não — renovar no vencimento |
| DITR/CAFIR | **Anual** — entrega entre agosto e setembro | Declaração entregue dentro do prazo do exercício corrente | Não — obrigação anual |
| Licença Ambiental | LP: ~5 anos; LI: ~6 anos; LO: ~10 anos (renováveis) | Licença vigente para a atividade desenvolvida | Não — renovar antes do vencimento |
| Outorga de água | 5 anos (regular) / 3 anos (uso insignificante) | Outorga ativa; uso compatível com a autorização | Não — renovar antes do vencimento |

---

## 3. Situações cadastrais do CAR (SICAR)

São 4 estados oficiais. Impacto direto no crédito conforme **Resolução CMN 5.193/2024** (em vigor para operações a partir de jan/2026):

| Status | Significado | Impacto para o produtor |
|---|---|---|
| **Ativo** | Cadastro aceito, regular, sem pendências bloqueantes | Pode acessar Pronaf, Pronamp, Plano Safra, custeio, investimento. Pré-requisito de crédito satisfeito |
| **Pendente** | Enviado mas ainda não analisado pelo órgão, ou com inconsistências que precisam de complementação | Crédito com risco: o MCR exige CAR "sem pendências". Produtor deve acessar a Central do Proprietário e resolver as pendências antes da safra |
| **Suspenso** | Bloqueado por irregularidade grave (desmatamento, sobreposição não declarada, embargo) | Crédito **bloqueado** (Res. CMN 5.193). Regularizar junto ao órgão ambiental estadual antes de qualquer operação |
| **Cancelado** | Inválido por decisão administrativa ou judicial | Crédito **bloqueado**. Deve ser reinscrito do zero; imóvel perde todos os benefícios associados ao CAR |

**Fonte:** [Nota Explicativa MMA / Manual de Crédito Rural, fev/2026](https://www.gov.br/mma/pt-br/assuntos/controle-ao-desmatamento-queimadas-e-ordenamento-ambiental-territorial/controle-do-desmatamento-1/NotaExplicativaManualdeCreditoRural_MMA_02_02_2026.pdf); [Res. CMN 5.193/2024](https://www.gov.br/conecta/catalogo/apis/consulta-sicar-cpf-cnpj).

---

## 4. Viabilidade técnica hoje

### 4a. APIs existentes no Conecta gov.br (Serpro)

| API | O que retorna | Acesso |
|---|---|---|
| [Consulta SICAR CPF/CNPJ](https://www.gov.br/conecta/catalogo/apis/consulta-sicar-cpf-cnpj) | Lista de imóveis do CPF com status e código CAR | **Restrita a órgãos públicos** (federal/estadual/municipal). Privados: nao-disponivel |
| [SICAR Imóvel](https://www.gov.br/conecta/catalogo/apis/sicar-imovel) | Dados do imóvel, situação, PRA, área, módulos fiscais | **Restrita a órgãos públicos** — JSON, OAuth WSO2/Dataprev |
| [SICAR Demonstrativo](https://www.gov.br/conecta/catalogo/apis/api-sicar-demonstrativo) | Status + APP/RL/RUAS + sobreposições + polígono | **Restrita a órgãos públicos** — JSON |
| [SICAR Tema](https://www.gov.br/conecta/catalogo/apis/sicar-tema) | Temas (cobertura, uso) do imóvel | **Restrita a órgãos públicos** |
| [SIGEF Geo](https://www.gov.br/conecta/catalogo/apis/sigef-geo) | Parcelas georreferenciadas certificadas | **Restrita a órgãos públicos** |
| CNIR/SNCR (Serpro) | Dados cadastrais rurais | Não há catálogo público de API para consumo privado |

**Conclusão API:** nenhuma das APIs Conecta está disponível para um app privado sem convênio com órgão público. O caminho de integração seria via parceria com órgão estadual ou MMA (o que é possível para uma fintech ou empresa credenciada, mas não imediato).

### 4b. O que é automatizável hoje SEM convênio

| Ação | Viável hoje | Mecanismo |
|---|---|---|
| Consulta pública por nº CAR (situação + geometria) | **Sim** (parcial) | [consulta.car.gov.br](https://consulta.car.gov.br) — scraping/WebView; não há API JSON pública. Retorna status e polígono no mapa, mas não gera PDF |
| Download do Recibo e Extrato do CAR | **Não automatizável** | Requer login gov.br do produtor — apenas o próprio produtor pode baixar via Meu Imóvel Rural (ou via app oficial) |
| Emissão do CCIR | **Não automatizável** | Requer CPF + NIRF + pagamento de taxa; o produtor faz manualmente em sncr.serpro.gov.br |
| Download de SIGEF | **Não automatizável** | Requer acesso ao portal SIGEF ou Meu Imóvel Rural com login gov.br |
| CAF extrato | **Não automatizável** | Login gov.br no portal caf.mda.gov.br |
| DITR/CAFIR | **Não automatizável** | e-CAC — login gov.br Prata/Ouro |
| Licença/Outorga | **Não automatizável** | Portais estaduais fragmentados, sem padrão nacional |

### 4c. O que o app Meu Imóvel Rural oficial já faz

O [app oficial do governo](https://agenciagov.ebc.com.br/noticias/202507/governo-lanca-meu-imovel-rural-aplicativo-que-reune-em-um-so-lugar-informacoes-de-imoveis-rurais) (lançado jul/2025) já centraliza CAR + SNCR + SIGEF + CAF com download de PDF via login gov.br. Ou seja, **a visão do dono já existe na forma de app oficial** — o CAR Campo não precisa duplicar essa infraestrutura, pode complementá-la.

### 4d. Viabilidade da visão do dono — diagnóstico honesto

| Componente da visão | Viabilidade real hoje | O que precisaria para automatizar de verdade |
|---|---|---|
| Listar quais documentos existem para o imóvel | **Viável com mock** — o catálogo é determinístico (se tem carNumero → tem Recibo e Extrato; se tem matrícula → tem Matrícula; etc.) | API Conecta SICAR com credencial de órgão parceiro |
| Mostrar STATUS de cada documento | **Viável com lógica local** — validades conhecidas (CCIR anual, CAF 3/5 anos, DITR anual) + data de emissão informada pelo produtor ou mock | Campos `emitidoEm` e `venceEm` no `Documento`; cálculo de vencimento local |
| Visualizar / abrir o PDF | **Viável** — o produtor já baixou manualmente e anexou ao app; ou o app redireciona para o portal oficial via deeplink/WebView | Parceria com Serpro/Conecta para download automático com token gov.br do produtor (OAuth delegado) |
| Compartilhar (WhatsApp, e-mail) | **Viável** — `expo-sharing` sobre o arquivo local | Já implementado no codebase (`docPdf.ts`) |
| Atualização automática (sincronizar) | **Não viável sem credencial institucional** | Convênio com MMA/INCRA/MDA para uso das APIs Conecta; ou integração com o app Meu Imóvel Rural via intent/deep link |

---

## 5. Modelo de STATUS recomendado para o app

### Enum

```typescript
type DocStatus =
  | 'em-dia'         // documento presente e dentro da validade
  | 'vencido'        // validade expirada (data calculável)
  | 'pendente'       // presente mas aguardando análise / CAR status pendente
  | 'precisa-refazer'// houve alteração no imóvel que invalida o doc atual
  | 'nao-se-aplica'  // ex.: CAF para produtor não-familiar
  | 'ausente';       // não foi anexado / não encontrado no gov.br (mock)
```

### Mapeamento por documento

| Documento | Regra de status |
|---|---|
| Recibo do CAR | `em-dia` se status SICAR = Ativo; `pendente` se Pendente; `precisa-refazer` se Suspenso/Cancelado; `ausente` se não tem carNumero |
| Extrato do CAR | `em-dia` se emitido após última retificação do imóvel; `precisa-refazer` se houve retificação de perímetro após a emissão; `ausente` se não anexado |
| CCIR | `em-dia` se `emitidoEm` está no exercício corrente; `vencido` se ano anterior ou anterior; `ausente` se não tem |
| Planta SIGEF | `em-dia` se certificado (permanente, sem retificação posterior); `precisa-refazer` se houve re-demarcação com delta significativo (usar `deltaRelatorio`); `ausente` se perímetro nunca georreferenciado |
| Matrícula | `em-dia` se presente (certidão emitida ≤ 90 dias: depende do banco — flag opcional); `ausente` se não anexada |
| CAF | `em-dia` se `emitidoEm` + validade (3 ou 5 anos por região) > hoje; `vencido` se expirado; `nao-se-aplica` se produtor não é agricultor familiar; `ausente` se não tem |
| ITR / DITR | `em-dia` se entrega do exercício corrente (agosto–set) foi feita; `vencido` se exercício anterior sem entrega; `ausente` se não tem comprovante |
| Licença ambiental | `em-dia` se `venceEm` > hoje; `vencido` se vencido; `ausente` se não tem; `nao-se-aplica` se atividade não requer licença |
| Outorga de água | Idem licença; `nao-se-aplica` se não usa recurso hídrico |

### Campo sugerido no tipo `Documento`

```typescript
// Adicionar em types.ts — dois campos opcionais
venceEm?: number;     // epoch ms da data de vencimento (CCIR, CAF, Licença, Outorga)
statusDoc?: DocStatus; // calculado ou informado
```

O cálculo de `statusDoc` pode ficar em `docHub.ts` (função `calcularStatusDoc(doc, imovel, hoje)`), centralizando a lógica e facilitando testes unitários.

---

## Conclusão acionável

**A visão do dono é viável — com um modelo híbrido:**

1. **Catálogo local (já existe no codebase):** `CATALOGO_DIGITAL` + `documentosDisponiveis()` em `docHub.ts` já entrega a lista determinística de quais documentos devem existir para o imóvel. A tela já mostra "presentes" vs. implicitamente "faltando".

2. **STATUS calculável localmente (implementar agora):** validades de CCIR (anual), CAF (3/5 anos), DITR (anual), licença/outorga (datas explícitas) são calculáveis a partir do campo `emitidoEm` já existente no tipo `Documento` + novo campo `venceEm`. Nenhuma API externa necessária para o MVP.

3. **Download automático (bloqueio real):** as APIs Conecta (SICAR, SIGEF) são restritas a órgãos públicos. Para um app privado, o fluxo hoje é: produtor baixa manualmente no Meu Imóvel Rural / portais e anexa ao CAR Campo — exatamente o que o "Adicionar documento" já suporta. No demo/hackathon: mock com `sincronizarDocumentos()` já implementado.

4. **Caminho de desbloqueio futuro:** parceria com órgão estadual ou credenciamento como prestador de ATER (Assistência Técnica) pode abrir acesso às APIs Conecta. Alternativa mais rápida: deep link para o app oficial Meu Imóvel Rural quando o produtor precisar baixar um documento.

5. **Compartilhar:** `expo-sharing` sobre o arquivo local — já funciona. Nenhuma mudança necessária.

**O que NÃO é viável hoje sem convênio institucional:** pull automático dos PDFs dos portais oficiais. Seria web scraping frágil e juridicamente arriscado. O modelo correto é: o produtor traz os arquivos (ou os baixa via Meu Imóvel Rural) e o app organiza, calcula status e facilita o compartilhamento.

---

## Fontes principais

- [Baixar documentos do CAR pela plataforma Meu Imóvel Rural — gov.br](https://www.gov.br/pt-br/servicos/baixar-documentos-do-car-cadastro-ambiental-rural-pela-plataforma-meu-imovel-rural)
- [Lançamento do app Meu Imóvel Rural — Agência Gov, jul/2025](https://agenciagov.ebc.com.br/noticias/202507/governo-lanca-meu-imovel-rural-aplicativo-que-reune-em-um-so-lugar-informacoes-de-imoveis-rurais)
- [CCIR 2025 — INCRA gov.br](https://www.gov.br/incra/pt-br/assuntos/noticias/emissao-do-ccir-2025-estara-disponivel-a-partir-de-17-de-junho)
- [CAF 3.0 — MDA gov.br](https://caf.mda.gov.br/)
- [SIGEF Geo API — Conecta gov.br](https://www.gov.br/conecta/catalogo/apis/sigef-geo)
- [SICAR Demonstrativo API — Conecta gov.br](https://www.gov.br/conecta/catalogo/apis/api-sicar-demonstrativo)
- [SICAR Imóvel API — Conecta gov.br](https://www.gov.br/conecta/catalogo/apis/sicar-imovel)
- [Consulta SICAR CPF/CNPJ API — Conecta gov.br](https://www.gov.br/conecta/catalogo/apis/consulta-sicar-cpf-cnpj)
- [Nota Explicativa MMA / MCR, fev/2026](https://www.gov.br/mma/pt-br/assuntos/controle-ao-desmatamento-queimadas-e-ordenamento-ambiental-territorial/controle-do-desmatamento-1/NotaExplicativaManualdeCreditoRural_MMA_02_02_2026.pdf)
- [Outorga de Recursos Hídricos — ANA gov.br](https://www.gov.br/ana/pt-br/assuntos/gestao-das-aguas/politica-nacional-de-recursos-hidricos/outorga-dos-direitos-de-uso-de-recursos-hidricos)
- [CAFIR — Receita Federal gov.br](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/cadastros/cafir)
