# Ajustes para o pitch — design

Data: 2026-06-28 · Branch: `feat/pitch-ajustes`

Quatro frentes pedidas para a demonstração. Duas tocam apenas o app
(`car-campo-app`); uma toca também a API (`car-geo-api`).

## A. Checklist "emissão oficial do CAR"

Arquivos: `src/lib/checklistCAR.ts`, `src/screens/DocumentosScreen.tsx`
(`PassoRow`).

Hoje cada passo tem `jaCobertoPeloApp: boolean`. Trocar por um modelo de
**status com tag visual** e reordenar com o mapa em primeiro.

Modelo:

```ts
type StatusPasso = 'feito-app' | 'voce-ja-tem' | 'a-fazer' | 'em-analise';
// no PassoCAR: status: StatusPasso; solicitarTecnico?: boolean;
// remove jaCobertoPeloApp
```

Tags (texto + cor):

- `feito-app` → "Adiantado pela sua medição" (verde, check cheio)
- `voce-ja-tem` → "Você já tem" (verde, check cheio)
- `a-fazer` → "A fazer" (neutro/cinza)
- `em-analise` → "Em análise" (âmbar)

Ordem e status final:

| Ordem | id | status / ação |
|---|---|---|
| 1 | `perimetro-gps` | `feito-app` |
| 2 | `cpf-responsavel` | `voce-ja-tem` |
| 3 | `documento-da-terra` | `voce-ja-tem` |
| 4 | `ccir-quitado` | `a-fazer` |
| 5 | `croqui-app-reserva-legal` | `a-fazer` |
| 6 | `inscricao-sicar` | `a-fazer` |
| 7 | `georreferenciamento-incra-sigef` | `a-fazer` + `solicitarTecnico: true` |
| 8 | `analise-orgao-estadual` | `em-analise` |

`PassoRow` passa a renderizar a tag conforme `status`; quando
`solicitarTecnico`, mostra um botão "Solicitar técnico" que dispara o mesmo
fluxo de visita usado na Revisão.

## B. Link do PDF acessível na web

Arquivos: `car-geo-api/apps/api/src/routes/index.ts` (nova rota),
`car-campo-app/src/lib/export.ts` (`uploadPDFLink`).

- API: nova rota `GET /documentos/:id/ver` → página HTML simples com a marca
  CAR Campo, o PDF embutido em `<iframe src="/documentos/:id">` e um botão
  "Baixar PDF". Reusa `getDocument(id)` (404 se não existir). A rota atual
  `GET /documentos/:id` (bytes inline) permanece igual.
- App: `uploadPDFLink` passa a devolver a URL do visualizador
  (`${url}/ver`), para o link compartilhado abrir a página, não o PDF cru.
- Config: `app.json > extra.apiBaseUrl` já aponta para
  `https://car-geo-api.onrender.com` (corrigido). O erro "fetch failed" do
  print era config antiga (IP da LAN) sem reload do app.
- A rota nova só entra no ar após push/deploy do repo da API no Render.

## C. Finalizar leva o produtor para a Home

Arquivo: `src/screens/RevisaoScreen.tsx`.

Adicionar botão primário "Concluir" ao fim da Revisão (último passo do wizard)
que chama `switchTab({ name: 'home' })`. Mantém o "Voltar" existente.

## D. Notificações só informativas

Arquivo: `src/screens/NotificacoesScreen.tsx`.

Remover os itens do tipo `critico` (derivados de `alertaDivergencia`) e o
estilo de borda/badge vermelho. O feed fica só informativo: licença liberada,
documento aprovado, visita confirmada, atualização de sistema, lembrete. O
tipo `critico` sai do union `Tipo` e do mapa `TIPO`.

## Reuso: solicitar visita do técnico

A lógica de solicitar visita hoje vive inline em `RevisaoScreen`
(`handleSolicitarVisita`): atualiza `solicitacaoVisita` + `status='enviado'` no
store e faz best-effort `submitPerimeter`. Extrair o núcleo para
`src/lib/visita.ts` (`solicitarVisitaTecnico(imovel, motivo, detalhe)`),
chamado tanto pela Revisão quanto pelo botão do checklist. A UI de escolha de
motivo (Alert) permanece em cada tela.

## E. Remover toda a parte do analista (foco no produtor)

Foco agora é o fazendeiro: ele gera uma **documentação provisória** para
confrontar na visita técnica. A figura do analista sai do app.

Decisões:
- **Login:** manter só o do produtor (gov.br mock). Remover o caminho de
  analista (matrícula+senha). A sessão/identidade do produtor continua (usada
  no pré-preenchimento e no PDF).
- **Visitas:** `VisitasScreen` e `AgendarVisitaScreen` ficam como visão do
  **produtor** (ele solicita e acompanha a visita que vai confrontar com a doc
  provisória). Ajustar textos que falem em "analista/fila do analista".
- **Apagar de vez** os arquivos exclusivos do analista.

Apagar (analista-only, confirmado pelo grafo de imports):
- `src/screens/ValidacaoScreen.tsx`
- `src/screens/PainelScreen.tsx`
- `src/screens/ConferenciaLabScreen.tsx`

Manter (compartilhado com telas do produtor que ficam — NÃO apagar):
- `src/lib/conferencia.ts`, `src/lib/alteracao.ts`, `src/lib/delta.ts`,
  `src/lib/credito.ts`, `src/lib/docHub.ts` (usados por Demarcação, Revisão,
  Visitas, AnáliseAmbiental, etc.).

Desligar o perfil analista:
- `src/types.ts`: `Perfil = 'produtor'` (remover `'analista'`).
- `src/app/TabBar.tsx`: remover `TABS_ANALISTA`; `tabsForPerfil` sempre
  `TABS_PRODUTOR`.
- `src/app/Router.tsx`: remover rotas `validacao`, `painel`, `conferencia-lab`
  e o branch por perfil em `medicoes` (sempre `MedicoesScreen`); remover os
  imports correspondentes.
- `src/app/navigation.tsx`: remover os `RouteName` `validacao`/`painel`/
  `conferencia-lab` e referências de perfil analista.
- `src/auth/*`: remover o método de login por matrícula (analista) do
  `AuthContext`/`mockAuthProvider`/`types`, mantendo o gov.br do produtor.
- `src/screens/LoginScreen.tsx`: remover a UI de login do analista.
- `src/screens/ConfigScreen.tsx`: remover o ramo de identidade do analista.
- `src/lib/seed.demo.ts`: remover seeds que só servem ao analista, se houver.
- Textos: trocar "fila do analista" por algo neutro ("solicitação enviada")
  em `RevisaoScreen`, `visita.ts`, `VisitasScreen`, `AgendarVisitaScreen`.

Critério de pronto: `npx tsc --noEmit` PASS sem imports/símbolos órfãos, e o
app abre direto no fluxo do produtor (sem nenhuma aba/rota de analista).

## Não-objetivos

- Não mexer no cálculo geodésico, captura GPS ou validação topológica.
- Não adicionar autenticação à rota `/ver` (documento já é público por id).
- Não persistir notificações reais (feed segue demo/derivado).
