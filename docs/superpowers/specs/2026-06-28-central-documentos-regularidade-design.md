# Central de Documentos + Aviso de Regularidade — Design

> Status: aprovado · 2026-06-28 · CAR Campo (produtor)

## Problema

Hoje a aba **Documentos** mostra a propriedade com "0 docs" e, ao abrir, oferece
uma grade onde o produtor precisa **sair do app e baixar manualmente** cada
documento no gov.br / INCRA / SICAR e reimportar. Não faz sentido: vários desses
documentos já existem em formato digital e estão associados ao CPF/imóvel do
produtor. O app deveria ser o **centralizador** dos documentos das propriedades.

Além disso, não há nenhum sinal de que **terra não regularizada** (documentos
faltando ou área em conflito) pode **impedir crédito rural e financiamento
bancário** — informação de alto valor para o produtor.

## Objetivo

1. Ao abrir uma propriedade, **trazer automaticamente** os documentos digitais
   disponíveis (sincronização mockada gov.br/SICAR/INCRA), sem o produtor baixar
   de outro lugar.
2. Mostrar um **aviso de regularidade** que conecta documentos faltando + área em
   risco ao **impacto em crédito/financiamento**.

Escopo: **apenas perfil produtor**, fluxo de Documentos. Offline-first; gov.br
continua mockado (seam isolado para integração real depois).

## Decisões (travadas no brainstorming)

- **Auto-preenchimento:** seam de sincronização mock (`docHub`), espelhando o
  `AuthProvider`. Auto-sync ao abrir + botão "Sincronizar".
- **Regra de risco:** documentos obrigatórios faltando **+** área em conflito,
  combinados, estimando "X ha em risco".
- **Local do aviso:** chip de regularidade no card do hub **+** banner detalhado
  no detalhe da propriedade.

## Não-objetivos (YAGNI)

- Interface genérica multi-provider (um módulo mock, seam marcado por comentário).
- Abertura/visualização de PDF remoto real — docs gov.br no demo são **metadados**
  (nome, órgão, data); tocar mostra aviso "documento sincronizado (demo)".
- Recomputar overlay ambiental — reusar sinais já presentes no `Imovel`.
- Perfil analista, e qualquer envio à API.

## Arquitetura

### Unidade nova: `src/lib/docHub.ts`

Responsabilidade única: catálogo de documentos digitais, sincronização mock e
avaliação de regularidade. Não toca em UI nem em file system.

#### Catálogo de tipos digitais

`CATALOGO_DIGITAL: Record<DocumentoTipo, DocMeta>` onde `DocMeta`:

```ts
interface DocMeta {
  label: string;            // "Recibo do CAR"
  orgao: string;            // "SICAR / Meu Imóvel Rural"
  origemUrl?: string;       // onde obter manualmente (fallback)
  digital: boolean;         // true = sincronizável via gov.br no demo
  obrigatorioCredito: boolean; // pesa no aviso de regularidade
}
```

Tipos digitais cobertos (já existem em `DocumentoTipo`): `car`, `car-extrato`,
`ccir`, `sigef`, `matricula`, `caf`, `itr`, `licenca`. Não-digitais
(`rg`, `foto-divisa`, `outro`) continuam manuais.

Obrigatórios para crédito: `car`, `ccir`, `sigef`, `matricula` (base do MCR/BACEN
+ comprovação de posse/área). Os demais entram como recomendados.

#### `sincronizarDocumentos(imovel, sessao): Promise<Documento[]>`

Mock determinístico (sem rede; pequeno atraso simulado para a UX de loading).
Regra: devolve os documentos digitais que "existiriam" no gov.br para a
propriedade, **sem duplicar** os que o produtor já anexou manualmente:

- Imóvel com `carNumero` preenchido → inclui `car` + `car-extrato`.
- Sempre que houver `matricula` nos dados → inclui `matricula`.
- `ccir`, `itr` → incluídos (cadastro INCRA/Receita por CPF).
- `sigef` → incluído apenas se a geometria tem ≥ 3 pontos (foi georreferenciado).
- `caf`, `licenca` → **não** retornados por padrão (nem todo imóvel tem) →
  permanecem como pendência → alimentam o aviso de regularidade.

Cada `Documento` sincronizado: `origem: 'govbr'`, `orgao`, `emitidoEm`,
`uri: ''` (metadado), `nome` legível ("Recibo do CAR — 2026").

> Seam: esta função é o ponto único de troca por OIDC+PKCE / WFS governamental.
> Marcar com comentário `// SEAM: integração gov.br real entra aqui`.

#### `avaliarRegularidade(imovel): RegularidadeImovel`

```ts
type NivelRegularidade = 'regular' | 'pendente' | 'critico';

interface RegularidadeImovel {
  nivel: NivelRegularidade;
  haEmRisco: number;              // hectares estimados não regularizados
  docsObrigatoriosFaltando: DocumentoTipo[];
  podeImpactarCredito: boolean;
  titulo: string;                 // "Regularização pendente"
  mensagem: string;               // explica impacto em crédito/financiamento
  disclaimer: string;             // informativo (reusa tom de credito.ts)
}
```

Lógica (combina docs + área, só com dados já no `Imovel`):

- **Docs faltando:** obrigatórios do catálogo ausentes em `imovel.documentos`.
- **Área em risco (`haEmRisco`):**
  - `alertaDivergencia?.delta_ha` (área que divergiu da medição registrada), ou
  - `deltaRelatorio` quando houver, senão 0.
- **Nível:**
  - `critico` se `validacao.status === 'reprovado'` **ou** `alertaDivergencia.severidade === 'critico'`.
  - `pendente` se há docs obrigatórios faltando **ou** `haEmRisco > 0`.
  - `regular` caso contrário.
- **`podeImpactarCredito`:** `nivel !== 'regular'`.
- **Mensagem:** quando pendente/crítico, texto curto pt-br conectando ao crédito,
  ex.: *"~7,1 ha não regularizados e 1 documento obrigatório faltando podem
  impedir o acesso a crédito rural (Pronaf/Pronampe) e financiamento bancário."*

Função **pura e síncrona** — fácil de testar.

### Mudanças de tipo: `src/types.ts`

```ts
export interface Documento {
  // ...campos atuais...
  uri?: string;                       // opcional: docs sincronizados são metadados
  origem?: 'govbr' | 'manual';        // default 'manual'
  orgao?: string;                     // preenchido para origem 'govbr'
  emitidoEm?: number;                 // data de emissão (epoch ms), origem 'govbr'
}

export interface Imovel {
  // ...
  documentosSincronizadosEm?: number; // epoch ms da última sync gov.br
}
```

`documents.ts` (picker manual) passa a setar `origem: 'manual'` ao criar.

### `src/screens/DocumentosScreen.tsx`

- **Auto-sync no mount:** se `imovel.documentosSincronizadosEm` ausente, dispara
  `sincronizarDocumentos`, mostra loading ("Buscando seus documentos no gov.br…"),
  faz merge dos resultados na lista (sem duplicar tipos já presentes), persiste via
  `updateImovel({ documentos, documentosSincronizadosEm })`.
- **Botão "Sincronizar com gov.br"** no topo da seção de documentos: re-roda a sync
  (atualiza/insere, não duplica).
- **Selo de origem** em cada item: `🔗 gov.br · <órgão>` para `origem === 'govbr'`;
  itens gov.br ao toque mostram `Alert` "documento sincronizado do gov.br (demo)".
- **Banner de regularidade** (de `avaliarRegularidade`): cor por nível
  (verde/âmbar/vermelho), título, mensagem de impacto em crédito, lista do que
  falta e disclaimer. Esconde quando `nivel === 'regular'`.

### `src/screens/DocumentosHubScreen.tsx`

- Substituir o chip atual de status por **chip de regularidade**
  (`avaliarRegularidade`): Regular / Pendência / Crítico.
- Mostrar "**X ha em risco**" no rodapé do card quando `haEmRisco > 0`
  (no lugar/junto da área).
- `docCount` passa a refletir docs sincronizados (já que o hub lista da store).

## Fluxo de dados

```
abrir propriedade
  → getImovel(id)
  → se !documentosSincronizadosEm: sincronizarDocumentos(imovel, sessao)
        → merge docs (govbr + manuais existentes)
        → updateImovel({ documentos, documentosSincronizadosEm })
  → avaliarRegularidade(imovel)  → banner
hub
  → listImoveis() → por card: avaliarRegularidade(imovel) → chip + ha em risco
```

## Tratamento de erro

- `sincronizarDocumentos` nunca lança: em falha retorna `[]` e o app segue
  (offline-first). UI mostra "Nenhum documento novo encontrado".
- `uri` ausente: viewer/abertura guardam contra `uri` vazio (mostram aviso demo).
- Auto-sync roda uma vez (guard por `documentosSincronizadosEm`) — não re-sincroniza
  em loop a cada foco de tela.

## Testes

`avaliarRegularidade` e a regra de merge de `sincronizarDocumentos` são pura lógica
→ um self-check `src/lib/docHub.test.ts` (assert-based, sem framework) cobrindo:

1. Imóvel com `carNumero` + geometria → sync inclui `car`, `car-extrato`, `ccir`,
   `sigef`, `matricula`; não inclui `caf`/`licenca`.
2. Merge não duplica tipo já presente (manual prevalece).
3. `avaliarRegularidade`: imóvel sem docs obrigatórios → `pendente`/`critico` e
   `podeImpactarCredito === true`; imóvel com todos + sem área em risco → `regular`.
4. `haEmRisco` reflete `alertaDivergencia.delta_ha`.

## Critérios de aceite

- [ ] Abrir propriedade no demo preenche documentos automaticamente com selo gov.br.
- [ ] Botão "Sincronizar" re-busca sem duplicar.
- [ ] Banner de regularidade aparece com impacto em crédito quando há pendência;
      some quando tudo regular.
- [ ] Hub mostra chip de regularidade + "X ha em risco" coerentes.
- [ ] Docs manuais (foto da divisa) continuam funcionando, marcados `manual`.
- [ ] `bun tsc --noEmit` limpo; self-check de `docHub` passa.
