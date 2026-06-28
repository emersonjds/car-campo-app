# Spec — Documentos honestos (remoção do mock gov.br)

Data: 2026-06-28 · Branch: `feat/documentos-honestos`

## Problema

A tela de Documentos exibia um catálogo sintético "Seus documentos" (CAF, ITR/CAFIR,
CCIR, Extrato do CAR, Georreferenciamento…) que fingia buscar documentos no gov.br.
Numa demo isso soa frágil/falso. A decisão: **remover o mock de vez** e deixar o app
mostrando só o que ele produz de verdade.

## Decisão

1. **Documentos = só o que o app gera.** A tela passa a oferecer o que existe de fato:
   medição preliminar em PDF e GeoJSON do perímetro — ambos gerados sob demanda.
2. **Regularidade por sinais reais.** O chip de regularidade do Hub deixa de depender
   de "documentos obrigatórios faltando" (mock) e passa a refletir validação do
   analista, sobreposição crítica e divergência de área.
3. **Crédito já era honesto** (`credito.ts` roda sobre a análise ambiental real) — não
   foi tocado.
4. **Visão do produtor enxuta.** A Revisão remove a Análise Ambiental (trabalho do
   analista) e a lista de anexos. A medição segue **preliminar**: a ação principal é
   **solicitar a visita do técnico**, que já registra/envia o imóvel à fila do analista.
5. **Acesso ao PDF no celular.** O produtor pode **visualizar** o PDF no próprio
   aparelho e **baixar/enviar** pelo share sheet.
6. **Checklist do CAR oficial.** Lista dos próximos passos para a emissão oficial do
   CAR, em linguagem simples, com órgão e "como obter" por item.

## Mudanças por arquivo

- `src/lib/docHub.ts` — removido todo o mock gov.br (`sincronizarDocumentos`,
  `documentosDisponiveis`, `listarDocumentosPropriedade`, `statusDocumento`,
  `mergeDocumentos`, tipos de status). `avaliarRegularidade` reescrito sobre sinais
  reais. Mantidos `solicitacaoMetragem` e `CATALOGO_DIGITAL` (mapa de rótulos).
- `src/lib/docPdf.ts` — **removido** (gerava PDFs oficiais falsos).
- `src/lib/export.ts` — novo `previewPDF` (visualização no celular via expo-print);
  tabela de "documentos anexados" retirada do PDF.
- `src/lib/checklistCAR.ts` — **novo**: `CHECKLIST_CAR_OFICIAL` (8 passos, base legal
  Lei 12.651/2012, SICAR, Decreto 12.689/2025).
- `src/screens/DocumentosScreen.tsx` — reescrita: seção "Documentos gerados em campo"
  (PDF: Visualizar / Baixar-Enviar; GeoJSON: Baixar-Enviar) + checklist do CAR oficial.
  Removidas "Fotos e anexos" e a sincronização gov.br.
- `src/screens/RevisaoScreen.tsx` — removidos os cards de Análise Ambiental e de
  Documentos anexados; "Solicitar visita do técnico" virou a ação principal (registra +
  envia); PDF ganhou Visualizar + Baixar/Enviar.
- `src/lib/store.ts` — `SEED_VERSION` 4 → 5 para descartar documentos gov.br que
  ficaram persistidos no AsyncStorage de execuções anteriores.

## Fora de escopo (registrado, não feito)

- **Link web clicável do PDF.** Offline o PDF é arquivo local (`file://`); uma URL
  exigiria upload para a `car-geo-api`. Fica como evolução futura.
- **Limpeza dos tipos gov.br em `types.ts`.** `DocumentoTipo` mantém os valores antigos
  (inertes); remover é varredura à parte que não muda comportamento.

## Verificação

- `npx tsc --noEmit` — sem erros.
- Sem referências órfãs ao código removido (`docPdf`, funções de sync do `docHub`).
- Não validado em emulador (preview do PDF e share sheet dependem de device/dev build).
