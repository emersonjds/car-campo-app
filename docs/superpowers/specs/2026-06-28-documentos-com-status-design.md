# Documentos da propriedade com status (conectado aos órgãos) — Design

> 2026-06-28 · CAR Campo (produtor). Inspirado no fluxo da Qore (CPF → busca nos
> órgãos reguladores → documentos em dia/vencidos). Fundamentado em
> `2026-06-28-car-documentos-viabilidade.md`.

## Visão

Ao logar (gov.br/CPF), o app age como se estivesse **conectado aos órgãos de
controle**: pelo CPF + nº do CAR traz **todos os documentos digitais** daquela
propriedade e mostra, para cada um, se está **em dia ou não** — e sinaliza
**novas solicitações de metragem** (re-demarcação que invalida documentos).

Realidade (research): as APIs Conecta gov.br (SICAR/SIGEF) existem mas são
fechadas a apps privados sem convênio. Então a "busca nos órgãos" é **mockada**
(seam `docHub`), mas o **status de validade é calculado 100% localmente** com
datas + regras reais. O modelo é honesto e pronto para a integração real depois.

## Decisões

- A lista de documentos deixa de mostrar só os sincronizados: passa a mostrar o
  **catálogo completo aplicável à propriedade**, cada item com **status**.
- Status (espelha Qore, adaptado ao CAR):
  `'em-dia' | 'vencendo' | 'vencido' | 'pendente' | 'ausente'`.
- Documento presente → ações **Visualizar** e **Compartilhar** (já existe `docPdf`).
- Documento ausente → badge "Falta" + dica de como obter (Meu Imóvel Rural).
- Banner de regularidade existente passa a refletir contagem de status.
- Card destacado de **nova metragem** quando há re-demarcação pendente.

## Modelo (em `src/lib/docHub.ts`)

```ts
export type DocStatus = 'em-dia' | 'vencendo' | 'vencido' | 'pendente' | 'ausente';

export interface ItemDocumento {
  tipo: DocumentoTipo;
  label: string;          // CATALOGO_DIGITAL[tipo].label
  orgao: string;
  status: DocStatus;
  doc?: Documento;        // presente (sincronizado/manual) → tem o que visualizar/compartilhar
  venceEm?: number;       // epoch ms quando aplicável
  detalhe: string;        // "Vence em 07/2026" · "Refaça (nova metragem)" · "Baixe no Meu Imóvel Rural"
}

export interface SolicitacaoMetragem {
  delta_ha: number;
  afeta: DocumentoTipo[]; // ex.: ['sigef', 'car-extrato']
  mensagem: string;
}
```

### `statusDocumento(tipo, imovel, doc, hoje): DocStatus` (puro)

Regras (research §5), só com dados do `Imovel`:

- **car** (Recibo): `pendente` se `alertaDivergencia?.severidade === 'critico'` ou
  `validacao?.status === 'reprovado'` (situação CAR Pendente); `em-dia` se presente
  e CAR ok; `ausente` se sem `carNumero` ou não presente.
- **car-extrato**: `vencido` (refazer) se há `deltaRelatorio` ou `alertaDivergencia`
  (perímetro mudou → extrato desatualizado); `em-dia` se presente; `ausente` se não.
- **ccir**: anual. Presente com `venceEm` → `vencido`/`vencendo`/`em-dia` por data;
  `ausente` se não presente.
- **sigef**: `vencido` (refazer) se re-demarcação pendente (delta); `em-dia` se
  presente e geometria estável; `ausente` se sem geometria/ não presente.
- **matricula**: `em-dia` se presente; `ausente` se sem `matricula` nos dados/não presente.
- **caf / itr / licenca**: por `venceEm` (`em-dia`/`vencendo`/`vencido`); `ausente` se não presente.

`vencendo` = vence em ≤ 60 dias. Datas vêm de `emitidoEm`/`venceEm` setados na sync.

### `listarDocumentosPropriedade(imovel, hoje): ItemDocumento[]`

Para cada `tipo` com `CATALOGO_DIGITAL[tipo].digital === true` **aplicável** à
propriedade (regra de aplicabilidade = a mesma de "deveria existir": car/car-extrato
se `carNumero`; ccir sempre; matricula se `matricula`; sigef se geometria≥3; caf/itr/licenca
sempre como recomendados), montar `ItemDocumento` com `doc` (se presente em
`imovel.documentos`) e `status` de `statusDocumento`. Ordenar: ausentes/vencidos/
pendentes primeiro (o que precisa de ação), depois em-dia.

### `solicitacaoMetragem(imovel): SolicitacaoMetragem | null`

`null` se sem `alertaDivergencia` e sem `deltaRelatorio`. Senão `delta_ha` =
`abs(alertaDivergencia?.delta_ha ?? deltaRelatorio?.acrescido_ha ?? 0)`,
`afeta = ['sigef','car-extrato']`, mensagem curta pt-br.

### Sync (mock "conectado aos órgãos")

`sincronizarDocumentos` passa a popular `emitidoEm` e `venceEm` realistas por tipo
(ex.: CCIR vence no fim do exercício; CAF +3 anos; ITR exercício corrente) para o
status variar de forma demonstrável. Determinístico por imóvel (sem `Date.now()` no
cálculo de datas-base — derivar de `imovel.createdAt`/`updatedAt`).

## Tipos (`types.ts`)

`Documento` ganha `venceEm?: number` (validade quando aplicável). `statusDoc` NÃO é
persistido (é derivado) — fica fora do tipo.

## UI (`DocumentosScreen.tsx`)

Ordem: mapa → **resumo de regularidade** (banner já existe; mensagem incorpora "N
vencidos · M pendentes") → **card "Nova metragem"** (se `solicitacaoMetragem`) →
**"Seus documentos"** = `listarDocumentosPropriedade` (todos, com badge de status e
detalhe; presente → Visualizar/Compartilhar; ausente → "Como obter") → "+ Adicionar
documento" → link "Atualizar documentos do gov.br".

Badge por status (cores): em-dia=verde, vencendo=âmbar, vencido=vermelho,
pendente=âmbar, ausente=cinza/contorno. Reusar `colors`.

`ItemDocumento` (componente da tela) passa a receber um `ItemDocumento` (modelo) e:
- mostra label, órgão, badge de status, linha `detalhe`;
- se `item.doc`: botões **Visualizar** (abre PDF via `abrirDocumentoDigital`) e
  **Compartilhar** (mesmo fluxo / share); X para remover só se `origem==='manual'`
  (não remover documento de órgão — em vez disso "Atualizar");
- se ausente: ação discreta "Como obter" → Alert com a origem (Meu Imóvel Rural / órgão).

## Não-objetivos (YAGNI / honestidade)

- Sem pull automático real dos PDFs governamentais (precisa convênio — research §4).
- Sem nova dependência. Reusa `expo-print`/`expo-sharing`/`docPdf`.
- Sem testes unitários (removidos do projeto por decisão do dono).

## Aceite

- [ ] Tela mostra TODOS os documentos aplicáveis da propriedade, com status.
- [ ] Presentes têm Visualizar e Compartilhar; ausentes mostram como obter.
- [ ] Documentos vencidos/pendentes destacados; banner reflete a situação.
- [ ] Card de "nova metragem" aparece quando há re-demarcação pendente.
- [ ] `npx tsc --noEmit` limpo. App não quebra para imóvel sem geometria/sem CAR.
