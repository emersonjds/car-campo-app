# Tela Documentos (Produtor) — Redesign Clean

> Status: spec · 2026-06-28 · CAR Campo · perfil produtor

---

## O que REMOVER

Tudo abaixo sai da tela do produtor. O motivo está ao lado de cada item.

| Elemento atual | Por que sai |
|---|---|
| Breadcrumb "Documentos › CAR" | O título da Screen já diz onde o usuário está. Ruído. |
| Título grande "Cadastro Ambiental Rural (CAR)" + chip + "ID: im_xxx" | Jargão jurídico, ID técnico — nenhum desses diz nada ao produtor. |
| Botões "Compartilhar" e "Baixar PDF" | Ação de exportação; não é o propósito desta tela. Move para Revisão se necessário. |
| Card "VISUALIZAÇÃO" (preview de imagem / placeholder PDF) | Nenhum doc gov.br tem arquivo local — o placeholder aparece sempre. É mentira visual. |
| Card "HISTÓRICO DE VERSÕES" | Audit trail de sistema; irrelevante para o produtor no campo. |
| Cards de métrica "Reserva Legal" e "APP" ambos com valor "—" + "Pendente" | Valores não calculados. Mostrar "—" é mais confuso que não mostrar. |
| Abas "Dados / Domínio / Uso do Solo" e todo o conteúdo interno | Duplica informação do cadastro; o mapa satélite embutido é peso desnecessário. |
| Card "CHECKLIST DE CONFORMIDADE" (Reserva Legal, APP, Georreferenciamento) | Jargão técnico; a informação útil entra no banner de regularidade (já existe e é melhor). |
| Grade de 11 botões "Adicionar documentos" com "📲 Baixe digital: gov.br…" | Matriz enorme; instrução de ir para outro app é atrito. Substituída por 1 botão. |

---

## O que MANTER (com ajuste de posição)

| Elemento | Ajuste |
|---|---|
| Lista de documentos (govbr + manual) | Sobe para o topo — é o conteúdo principal. |
| Chip/linha de área medida (`area_ha`) | Fica no topo, compacto, uma linha. |
| Banner de regularidade (`avaliarRegularidade`) | Mantido, mas compactado (ver abaixo). |
| Botão "Sincronizar com gov.br" | Mantido, discreto, abaixo da lista. |
| Rodapé fixo "Voltar / Revisão" | Inalterado. |

---

## Nova ordem de seções — topo ao rodapé

### 1. Header da Screen (nativo)

Título: nome da propriedade (ex.: "Fazenda Bom Jesus").
Sem subtítulo extra. O componente `<Screen>` já cuida disso.

### 2. Linha de metragem

Um cardzinho de uma linha, fundo `verdeBg` (#eaf3e6), canto arredondado 12dp, padding 12×16dp.
Altura fixa 56dp. Alvo de toque: não é tocável (exibição pura).

```
Área medida        39,82 ha
```

- Label "Área medida" — 13sp, `mutedText`, peso 600.
- Valor — 22sp, `inkText`, peso 800, alinhado à direita.
- Se `area_ha === 0`: label "Área ainda não medida" em `mutedText`, sem valor numérico.
- Token: `geometry.area_ha.toFixed(2) + ' ha'` — exatamente como hoje.

### 3. Banner de regularidade (condicional)

Aparece SOMENTE se `reg.podeImpactarCredito === true`.
Quando regular: não ocupa espaço nenhum.

**Layout:** borda esquerda 4dp colorida + fundo suave + ícone + 2 linhas de texto.

Cores:
- `nivel === 'critico'` → borda `#a3302a`, fundo `#FDECEC`
- `nivel === 'pendente'` → borda `#8a5a13`, fundo `#FFF7E6`

Conteúdo (máximo 2 linhas visíveis, sem scroll interno):

```
[!]  Documentos faltando podem impedir crédito rural.
     Falta: Recibo do CAR, CCIR, Matrícula
```

- Linha 1: `13sp, peso 700, inkText` — texto fixo por nível:
  - pendente: "Documentos faltando podem impedir crédito rural."
  - critico: "Regularização crítica — acesso a crédito bloqueado."
- Linha 2: `12sp, mutedText` — "Falta: [lista dos tipos faltando]" (labels do `CATALOGO_DIGITAL`).
  Se `docsObrigatoriosFaltando.length === 0` mas `haEmRisco > 0`: "~X ha não regularizados."
- Sem disclaimer na tela. O disclaimer aparece na Revisão onde o produtor assina o envio.

### 4. Seção "Seus documentos"

Título de seção: "Seus documentos" — 15sp, `inkText`, peso 700, margin-top 20dp.

Estado de carregamento (sincronizando):
```
[spinner]  Buscando seus documentos no gov.br…
```
Substituir a lista inteira pelo spinner; não mostrar lista parcial durante sync.

Estado vazio (0 documentos, sync concluído):
```
[ícone nuvem]
Nenhum documento ainda
Adicione a matrícula, a foto da divisa ou o CCIR
para ter tudo num lugar só.
```
— Componente `EmptyState` existente, mesma estrutura.

Lista de documentos: um card por item, verticalmente empilhados, gap 8dp.
Ordenação: govbr primeiro (ordem do `CATALOGO_DIGITAL`), depois manuais por `createdAt desc`.

### 5. Botão "+ Adicionar documento"

Logo abaixo da lista (ou do EmptyState).
Variante `outlined`, label "Adicionar documento", ícone "+" à esquerda, largura total.
Altura 52dp, borda `line`, texto `primary`.

Ao tocar: `Alert.alert` com opções de origem:
```
Que documento vai adicionar?
> Tirar foto (com localização)
> Escolher da galeria
> Escolher arquivo (PDF)
> Cancelar
```
O alert pede primeiro QUAL TIPO (lista simples dos tipos do `ORDEM_TIPOS` sem os emojis, só label) e
depois COMO (câmera / galeria / arquivo). Dois alerts em sequência, nativos — sem modal customizado.

### 6. Link discreto "Sincronizar com gov.br"

Abaixo do botão de adicionar. Não é botão cheio — é um `TouchableOpacity` com:
- Texto "Atualizar documentos do gov.br" — 13sp, `primary`, peso 600, alinhado ao centro.
- Estado `sincronizando`: substitui pelo texto "Atualizando…" + spinner inline.
- Alvo de toque: 44dp mínimo (hitSlop compensado).

Se `documentosSincronizadosEm` existe: linha abaixo em 11sp mutedText:
"Última atualização: [data formatada]"

### 7. Rodapé fixo

Inalterado: `[ Voltar ]` (secondary) + `[ Ir para Revisão ]` (primary).
Safe area inferior. Fundo branco, borda-topo `line`.

---

## Item de documento — o que mostrar

### Anatomia do card (56dp de altura mínima, padding 12dp)

```
[thumb 48×48]  Nome do tipo            [badge origem]
               Órgão (só govbr)              [botão ✕]
```

**Thumb (48×48dp, border-radius 10dp):**
- Foto real (uri local, mime image/*): thumbnail da imagem.
- PDF ou govbr sem uri: fundo `verdeBg` + ícone `document-text-outline` 24dp, cor `primary`.
- foto-divisa com geotag: fundo `verdeBg` + ícone `location-outline`, cor `verdeClaro`.

**Nome:** label do tipo (ex.: "Recibo do CAR"), não o nome do arquivo. 14sp, `inkText`, peso 700.
Se for `foto-divisa` com geotag: badge inline pequeno "com localização" — 11sp, `verdeClaro`.

**Badge de origem (canto superior direito do card):**
- `origem === 'govbr'`: pílula "gov.br" — fundo `verdeBg`, texto `primary`, 11sp, peso 700, border-radius 6dp.
- `origem === 'manual'` ou ausente: sem badge (implícito). Não escrever "Manual".

**Órgão (linha 2, só para govbr):** 12sp, `mutedText`. Ex.: "SICAR / Meu Imóvel Rural".

**O que NÃO mostrar:**
- Nome do arquivo (nome do file system — o usuário não sabe o que é `govbr_car`).
- Data de criação / emissão (nível de detalhe desnecessário na lista).
- Mime type.
- ID do documento.
- Texto "adicionado por você" ou "origem: manual".

**Botão remover (✕):**
- Presente para TODOS os documentos (govbr e manual).
- Círculo 36×36dp, fundo `#fde8e8`, ícone × em `critico`. hitSlop 8dp.
- Alert de confirmação diferenciado por origem (texto já implementado em `confirmarRemocao`).
- Apenas govbr: avisa que "pode restaurar em Atualizar documentos do gov.br".

---

## Tokens e medidas-chave

| Elemento | Altura/Largura | Toque |
|---|---|---|
| Linha de metragem | 56dp | não tocável |
| Banner de regularidade | auto, max ~72dp | não tocável |
| Card de documento | min 72dp | área inteira (exceto ✕) |
| Botão "+ Adicionar" | 52dp | 100% |
| Link "Sincronizar" | 44dp (hitSlop) | 100% |
| Botão ✕ remover | 36×36dp + hitSlop 8 | 52×52dp efetivo |
| Rodapé "Voltar / Revisão" | 52dp + safe-area | 100% |

Tipografia mínima: 12sp (badges/órgão), 13sp (hints), 14sp (nomes), 15sp (títulos de seção), 22sp (valor de área).

Contraste mínimo: `inkText` (#1d2b22) sobre `branco` (#ffffff) = 16:1. `mutedText` (#5d6b62) sobre branco = 5.9:1. Ambos passam WCAG AA (4.5:1) e são legíveis ao sol.

---

## Wireframe ASCII

Largura referência: 390dp. Padding lateral: 16dp.

```
┌──────────────────────────────────────────┐
│ ←  Fazenda Bom Jesus                    │  48dp — Screen header
├──────────────────────────────────────────┤
│                                          │
│  ╔══════════════════════════════════╗   │
│  ║  Área medida          39,82 ha  ║   │  56dp — cardzinho metragem
│  ╚══════════════════════════════════╝   │
│                                          │
│  ┌──────────────────────────────────┐   │  [só se podeImpactarCredito]
│  │ ! Documentos faltando podem      │   │  banner âmbar
│  │   impedir crédito rural.         │   │
│  │   Falta: Recibo do CAR, CCIR     │   │
│  └──────────────────────────────────┘   │
│                                          │
│  Seus documentos                         │  título de seção
│                                          │
│  ┌──────────────────────────────────┐   │
│  │ [PDF]  Recibo do CAR  [gov.br]   │   │  72dp — card doc govbr
│  │        SICAR / Meu Imóvel Rural  │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ [PDF]  CCIR           [gov.br]   │   │
│  │        INCRA                [✕]  │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ [PDF]  Matrícula      [gov.br]   │   │
│  │        Cartório de Registro [✕]  │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ [IMG]  Foto da divisa            │   │  card doc manual (sem badge)
│  │        [com localização]    [✕]  │   │
│  └──────────────────────────────────┘   │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  +  Adicionar documento          │   │  52dp — botão outlined
│  └──────────────────────────────────┘   │
│                                          │
│       Atualizar documentos do gov.br     │  link discreto 44dp
│       Última atualização: 28 jun. 2026   │  11sp mutedText
│                                          │
├──────────────────────────────────────────┤
│  [ Voltar ]          [ Ir para Revisão ] │  52dp + safe-area
└──────────────────────────────────────────┘
```

### Estado vazio (0 documentos após sync)

```
┌──────────────────────────────────────────┐
│ ←  Fazenda Bom Jesus                    │
├──────────────────────────────────────────┤
│  ╔══════════════════════════════════╗   │
│  ║  Área medida          39,82 ha  ║   │
│  ╚══════════════════════════════════╝   │
│                                          │
│          [ícone nuvem/doc]               │
│          Nenhum documento ainda          │
│   Adicione a matrícula, a foto da        │
│   divisa ou o CCIR para ter tudo         │
│   num lugar só.                          │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  +  Adicionar documento          │   │
│  └──────────────────────────────────┘   │
│                                          │
│       Atualizar documentos do gov.br     │
├──────────────────────────────────────────┤
│  [ Voltar ]          [ Ir para Revisão ] │
└──────────────────────────────────────────┘
```

### Estado sincronizando

```
┌──────────────────────────────────────────┐
│ ←  Fazenda Bom Jesus                    │
├──────────────────────────────────────────┤
│  ╔══════════════════════════════════╗   │
│  ║  Área medida          39,82 ha  ║   │
│  ╚══════════════════════════════════╝   │
│                                          │
│   Seus documentos                        │
│                                          │
│   [spinner]  Buscando seus documentos   │
│              no gov.br…                 │
│                                          │
├──────────────────────────────────────────┤
│  [ Voltar ]          [ Ir para Revisão ] │
└──────────────────────────────────────────┘
```

---

## Fluxo "Adicionar documento" — dois alerts nativos

```
[toca "+ Adicionar documento"]
        |
        v
Alert 1: "Que documento é esse?"
  - Recibo do CAR
  - CCIR
  - Matrícula
  - Foto da divisa
  - Outro documento
  - (outros tipos de ORDEM_TIPOS)
  - Cancelar
        |
  [escolhe tipo]
        |
        v
Alert 2: "Como vai adicionar?"
  - Tirar foto (com localização)   [só se tipo tem acoes.camera]
  - Escolher da galeria            [só se tipo tem acoes.galeria]
  - Escolher arquivo (PDF)         [só se tipo tem acoes.arquivo]
  - Cancelar
        |
  [escolhe origem]
        |
        v
  picker nativo → doc salvo → lista atualiza
```

Sem nenhuma instrução de "baixe no gov.br" neste fluxo. O sync automático já traz os que existem digitalmente. O produtor adiciona o que tem na mão (foto, PDF que recebeu).

---

## Decisões-chave

**Por que a metragem fica no topo e não num card de "Dados"?**
O produtor quer confirmar que a área que ele caminhou está certa antes de olhar os documentos. É a âncora da tela.

**Por que o banner de regularidade fica acima da lista e não abaixo?**
É uma informação de contexto que muda o que o produtor decide fazer na lista. Se ele vê "falta CCIR", já sabe o que precisa adicionar ao chegar em casa.

**Por que remover o mapa satélite desta tela?**
O mapa existe na tela de Demarcação. Duplicar aqui sem interatividade (scrollEnabled/zoomEnabled false) é peso sem valor.

**Por que dois alerts ao invés de uma bottom sheet customizada?**
O Alert nativo funciona offline, não precisa de componente, tem tamanho de toque garantido pelo SO, e o produtor já conhece o padrão. O menor risco de quebrar é zero código novo.
