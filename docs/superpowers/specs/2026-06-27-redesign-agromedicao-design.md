# Redesign "AgroMedição" — CAR Campo v2

> Design aprovado em 2026-06-27. Fonte da verdade para o plano de implementação.
> Mockups de referência em `design/` (produtor/ · analista/ · shared/).

## Objetivo

Aplicar um novo sistema visual (paleta + tipografia + layout dos mockups) ao app **CAR Campo**, reorganizando produtor e analista numa navegação de 4 abas, mantendo **100% da mecânica de marcação de perímetro** e o comportamento offline-first. Sem rebrand: o nome continua **CAR Campo**.

## Decisões travadas

- **Marca**: mantém "CAR Campo". Adota só o sistema visual dos mockups (a marca "TerraFiel" dos mockups é ignorada).
- **Navegação**: 4 abas por persona.
- **Login**: só os 2 cards de persona, **sem e-mail/senha** — toca e entra direto (mock de auth da persona).
- **Testes**: removidos nesta fase (todos os `*.test.ts(x)`, `vitest.config.ts`, dep e script de teste).
- **Escopo**: 6 telas dos mockups, 2 personas, tudo funcional.

## Design System (`src/theme/`)

### Paleta (tokens novos em `colors.ts`)

| Token | Hex | Uso |
|---|---|---|
| `primary` | `#2D5A27` | Verde principal (botões, cabeçalho, marca) |
| `secondary` | `#8B5E3C` | Terra/marrom (acento, ícones secundários) |
| `tertiary` | `#00A8E8` | Azul (info, "precisão L2", links) |
| `neutral` | `#F9F8F6` | Fundo do app |
| `regularizado` | `#2D5A27` | Status OK/validado |
| `critico` | `#a3302a` | Divergência crítica / alerta vermelho |
| `aviso` | `#8a5a13` | Atenção/âmbar |
| `inkText` | `#1d2b22` | Texto principal |
| `mutedText` | `#5d6b62` | Texto secundário |
| `line` | `#d9e4dc` | Bordas/divisores |
| `branco` | `#ffffff` | Cards |
| `acrescido` | `#f59e0b` | Área acrescida (conferência) — preservado |
| `suprimido` | `#2579c7` | Área suprimida (conferência) — preservado |

**Compatibilidade**: manter os nomes atuais (`verde`, `verdeClaro`, `verdeBg`, `terra`, `ink`, `muted`, `alerta`) como **alias** apontando para os novos valores, para as telas existentes não quebrarem durante a migração. `verde` → `primary` (`#2D5A27`), `terra` → `secondary` (`#8B5E3C`), `ink` → `inkText`, etc. Ajustar `verdeBg` para um verde-claro coerente com o novo primary.

### Tipografia

- Fonte **Inter** via `@expo-google-fonts/inter` + `expo-font` (asset JS, **sem rebuild nativo**).
- Escala: Headline (28–32, 800), Body (15–16, 400/600), Label (12–13, 700, uppercase tracking).
- Carregar no `App.tsx`/raiz com `useFonts`; enquanto carrega, manter splash (fallback system font aceitável).
- `src/theme/typography.ts` exporta a escala (família + tamanhos + pesos) para os componentes usarem.

### Componentes compartilhados (`src/ui/`)

- **Button**: variantes `primary` (verde sólido), `secondary` (cinza claro), `inverted` (escuro), `outlined` (borda). Já existem PrimaryButton/SecondaryButton — estender/renomear sem quebrar chamadas.
- **Card**: branco, raio 16, sombra suave, borda `line`.
- **SearchInput**: campo com ícone de lupa.
- **StatusChip**: pílula colorida (regularizado/crítico/aviso/info).
- **BottomNav**: 4 abas, ícone + label, aba ativa em verde com fundo pill.
- **FAB**: botão circular verde flutuante (Dashboard do produtor).
- **CircleAction**: botões de ação circulares (editar/excluir/etiqueta) — paleta verde/terra/azul/vermelho.
- **MetricBlock**: rótulo + número grande (ex.: `450 HECTARES TOTAIS`, `12.5 ha`).

## Navegação (`src/app/navigation.tsx` + `TabBar.tsx`)

4 abas por persona. `TAB_ROOTS` e o `TabBar` passam a derivar as abas do perfil.

**Produtor**: `dashboard` · `medicoes` · `documentos` · `perfil`
**Analista**: `painel` · `medicoes` · `documentos` · `perfil`

Mapeamento de rotas (mantém o roteador por estado atual; só reorganiza as raízes de aba e o conteúdo):

| Aba (Produtor) | Conteúdo |
|---|---|
| Dashboard | `HomeScreen` reformulado (mockup 01-dashboard) |
| Medições | Lista de medições + entrada para `DemarcacaoScreen` (mockup 02-medicao-mapa) |
| Documentos | `DocumentosScreen` + detalhe (mockup shared/01-documento-car) |
| Perfil | `ConfigScreen` |

| Aba (Analista) | Conteúdo |
|---|---|
| Painel | Painel do Analista = `PainelScreen` + alertas/pendências de `ValidacaoScreen` + visitas agendadas (mockup analista/01-painel) |
| Medições | Triagem + `ConferenciaLabScreen` (nova medição/conferência) |
| Documentos | `DocumentosScreen` (visão analista) |
| Perfil | `ConfigScreen` |

A `VisitasScreen` e o agendamento viram a tela **Agendar Visita Técnica** (mockup analista/02-agendar-visita), acessível do Painel e da fila de pendências.

## Telas (referência → requisitos)

### P1 · Produtor — Dashboard (`design/produtor/01-dashboard.png`)
Saudação ("Olá, João"), card **Meus Terrenos** (foto satélite, selo "Regularizado", nome, hectares, solo/última medição/CAR), **Ações Rápidas** (Iniciar Nova Medição em destaque, Consultar Documentos, Visualizar Mapas), **Documentos Recentes** (lista com download/ver), **Histórico de Medições** (card com status OK + "Ver Detalhes do Perímetro"), FAB. Dados reais do `store` (imóveis do produtor logado).

### P2 · Produtor — Medição/Mapa (`design/produtor/02-medicao-mapa.png`)
**PRESERVAR a mecânica**: `DemarcacaoScreen` continua com `usePerimeterTracker`/`useSimulatedWalk`, área/perímetro geodésicos, GeoJSON. Só restilizar o HUD: card **Área Atual** (ha + perímetro), chips **Precisão GPS** e **Acelerômetro**, controles de mapa (+/−/centralizar/camadas), botões **Finalizar Perímetro** (outlined) e **Marcar Ponto** (verde sólido).

### P3 · Produtor — Análise de Confrontação (`design/produtor/03-analise-confrontacao.png`)
Mapa com **STATUS: CRÍTICO – DIVERGÊNCIA DE ÁREA**, toggle "Dados Governo", **Análise de Confrontação** (relatório auto), blocos **Área Produtor** (`450.2 ha`, "Surveying L2 Precision" em azul) × **Área Governo** (`390.5 ha`). Reaproveitar `AlteracaoDetalheScreen`/`lib/alteracao.ts`/`lib/delta.ts` (já calculam delta).

### A1 · Analista — Painel (`design/analista/01-painel.png`)
"Painel do Analista", N alertas críticos, Filtrar + Nova Medição, card vermelho **Alertas de Divergência** (Agendar Visita Técnica / Ver Detalhes), **Média de Divergência** (4.2% com tendência), **Pendências de Validação** (lista com "12 Novos"), **Visitas Agendadas** (mini-calendário horizontal + itens com horário/local). Dados de `store` + `overlay`/`alteracao`/`conferencia`.

### A2 · Analista — Agendar Visita Técnica (`design/analista/02-agendar-visita.png`)
"AÇÃO NECESSÁRIA", calendário de mês, **Observações sobre a Divergência** (textarea), **Horários Disponíveis** (grade de slots, um desabilitado), card **Local da Visita** (gleba/coordenadas/divergência), **Confirmar Agendamento**. Evoluir o `CalendarModal` já criado para uma tela completa; persiste em `VisitaAgendada` (`dataVisita`, `periodo`/slot, observação).

### S1 · Documento CAR (`design/shared/01-documento-car.png`)
Header com breadcrumb, título **Cadastro Ambiental Rural (CAR)** + selo Validado, Compartilhar / Baixar PDF, **Visualização** (preview), **Histórico de Versões**, métricas **Área Total / Reserva Legal / APP**, abas (Dados do Imóvel/Domínio/Uso), mapa SIRGAS 2000, **Checklist de Conformidade** (itens OK + sobreposição em análise). Reaproveitar `DocumentosScreen` + `lib/export.ts` (PDF já existe).

### Login (`design/shared/02-login.png` — descrição)
Logo + "Bem-vindo" + tagline. **Eu sou:** dois cards (Produtor Rural / Analista de Campo). **Sem e-mail/senha** — tocar no card faz login mock daquela persona e entra direto. Reaproveita o seam `mockAuthProvider` (já tem `loginGovBr`/`loginMatricula`); criar um login direto por persona.

## Preservado (não quebrar)

- Marcação de perímetro: `usePerimeterTracker`, `useSimulatedWalk`, `sim/routes.ts`.
- Geometria geodésica e GeoJSON: `lib/geo.ts`.
- Offline-first: `lib/store.ts` (AsyncStorage).
- Seam de auth e secure-store.
- Motores de análise: `lib/overlay.ts`, `lib/alteracao.ts`, `lib/delta.ts`, `lib/conferencia.ts`.

## Remoção de testes

Apagar todos os `src/lib/*.test.ts` (alteracao, app, credito, delta, geo, overlay, refLayers.demo, refLayers) e `vitest.config.ts`. Remover `vitest`/`@vitest/*` do `package.json` e o script `test`. Nenhum runtime depende deles.

## Estratégia de execução (token-first)

1. **Fundação**: paleta + tipografia + componentes de `src/ui` (1 agente, bloqueia o resto).
2. **Navegação**: 4 abas + TabBar + roteamento por persona (1 agente, depende da fundação).
3. **Telas em paralelo** (dependem de 1 e 2):
   - Produtor: Dashboard, Medição (geo cuida do HUD sem tocar a mecânica), Confrontação.
   - Analista: Painel, Agendar Visita, (Documento CAR — shared).
4. **Limpeza**: remover testes + ajustar `package.json`.
5. **Gate**: `npx tsc --noEmit` zerado a cada etapa; app sobe no Metro sem rebuild nativo (só `@expo-google-fonts/inter` como asset JS).

## Riscos

- **Fonte Inter**: se `useFonts` atrasar o boot, manter fallback system até carregar.
- **Alias de cores**: a troca de valores dos nomes atuais muda o visual de telas ainda não migradas — aceitável (todas serão migradas nesta entrega).
- **Mecânica de perímetro**: só o agente `geo` mexe na `DemarcacaoScreen`, restrito ao HUD/estilo.
