# Redesign AgroMedição (CAR Campo v2) — Implementation Plan

> **For agentic workers:** este plano é executado por orquestração de subagents. Cada task termina em entregável testável por `npx tsc --noEmit` (zero erros) + boot no Metro. **Sem testes unitários** (regra do usuário). **Commits sem nenhum lastro de LLM** (sem `Co-Authored-By`, sem "Generated with Claude").

**Goal:** Aplicar o sistema visual dos mockups (paleta/tipografia/layout) ao CAR Campo, com navegação de 4 abas por persona, mantendo a mecânica de marcação de perímetro.

**Architecture:** Token-first. Primeiro a fundação (paleta + tipografia + componentes de `src/ui`), depois a navegação, depois as telas em paralelo por persona. Sem rebuild nativo — Inter entra como asset JS.

**Tech Stack:** React 19, React Native 0.85, Expo SDK 56, TypeScript, react-native-maps, AsyncStorage, `@expo-google-fonts/inter`.

## Global Constraints

- Nome do app permanece **CAR Campo** (sem rebrand TerraFiel).
- Paleta: `primary #2D5A27`, `secondary #8B5E3C`, `tertiary #00A8E8`, `neutral #F9F8F6`, `critico #a3302a`, `aviso #8a5a13`, `acrescido #f59e0b`, `suprimido #2579c7`.
- Nomes de cor atuais (`verde`, `terra`, `ink`, `muted`, `verdeBg`, `line`, `alerta`, `branco`) mantidos como **alias** dos novos valores — não quebrar telas durante a migração.
- **Preservar** a mecânica de perímetro: `usePerimeterTracker`, `useSimulatedWalk`, `lib/geo.ts`, `sim/routes.ts`. Só restilizar HUD.
- Offline-first intacto (`lib/store.ts`). Seam de auth intacto.
- `npx tsc --noEmit` zerado ao fim de cada task. App sobe sem rebuild nativo.
- Spec de referência: `docs/superpowers/specs/2026-06-27-redesign-agromedicao-design.md`. Mockups: `design/`.

---

### Task 0: Limpeza — remover testes + adicionar fonte

**Files:**
- Delete: `src/lib/alteracao.test.ts`, `src/lib/app.test.ts`, `src/lib/credito.test.ts`, `src/lib/delta.test.ts`, `src/lib/geo.test.ts`, `src/lib/overlay.test.ts`, `src/lib/refLayers.demo.test.ts`, `src/lib/refLayers.test.ts`, `vitest.config.ts`
- Modify: `package.json` (remover `vitest`, `@vitest/*`, script `test`; adicionar `@expo-google-fonts/inter` e garantir `expo-font`)

**Steps:**
- [ ] Apagar os 8 arquivos `*.test.ts` e `vitest.config.ts`.
- [ ] Em `package.json`: remover devDeps `vitest`/`@vitest/coverage-*` e o script `"test"`. Adicionar `"@expo-google-fonts/inter"` em deps (`expo-font` já vem com Expo; adicionar se ausente).
- [ ] `bun install`.
- [ ] Verificar: `npx tsc --noEmit` → zero erros. `git grep -l vitest` → vazio.
- [ ] Commit: `chore: remover testes unitários e adicionar fonte Inter`.

---

### Task 1: Fundação do design system (paleta + tipografia)

**Files:**
- Modify: `src/theme/colors.ts`
- Create: `src/theme/typography.ts`
- Modify: raiz de fontes (`App.tsx` ou `src/app/*`) para carregar Inter com `useFonts`

**Interfaces (Produces):**
- `colors.primary/secondary/tertiary/neutral/critico/aviso/...` + alias antigos.
- `type` exports de `typography.ts`: `fonts = { regular, medium, semibold, bold }`, `text = { headline, body, label, ... }` (família + tamanho + peso).

**Steps:**
- [ ] Em `colors.ts`: adicionar tokens novos e reapontar os nomes atuais como alias (ex.: `verde: '#2D5A27'`, `terra: '#8B5E3C'`, `verdeBg` para verde-claro coerente, manter `acrescido`/`suprimido`). Adicionar `primary/secondary/tertiary/neutral/critico/aviso/inkText/mutedText`.
- [ ] Criar `typography.ts` com a escala Inter (Headline/Body/Label) e pesos.
- [ ] Carregar Inter na raiz com `useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold })`; enquanto `!fontsLoaded`, manter splash/retornar null. Fallback system se falhar.
- [ ] Verificar: `npx tsc --noEmit` zero. App sobe e renderiza com Inter.
- [ ] Commit: `feat(theme): paleta AgroMedição e tipografia Inter`.

---

### Task 2: Componentes compartilhados (`src/ui`)

**Files:**
- Modify/Create em `src/ui/index.tsx` (+ arquivos novos se ficar grande): `Button` (variants primary/secondary/inverted/outlined), `Card`, `SearchInput`, `StatusChip`, `MetricBlock`, `CircleAction`, `FAB`.

**Interfaces (Consumes):** `colors`, `typography` da Task 1.
**Interfaces (Produces):** componentes acima com props tipadas; `PrimaryButton`/`SecondaryButton` continuam exportados (compat).

**Steps:**
- [ ] Implementar/estender os componentes seguindo `design/shared/00-paleta` (botões Primary/Secondary/Inverted/Outlined; chips; ações circulares verde/terra/azul/vermelho).
- [ ] Manter assinaturas de `PrimaryButton`/`SecondaryButton`/`Card`/`Field` existentes (não quebrar chamadas atuais).
- [ ] Verificar: `npx tsc --noEmit` zero.
- [ ] Commit: `feat(ui): biblioteca de componentes do novo design system`.

---

### Task 3: Navegação de 4 abas por persona

**Files:**
- Modify: `src/app/navigation.tsx` (rotas/abas), `src/app/TabBar.tsx`, `src/app/Router.tsx`

**Interfaces (Consumes):** componentes/ícones da Task 2.
**Interfaces (Produces):** abas Produtor `dashboard|medicoes|documentos|perfil`; Analista `painel|medicoes|documentos|perfil`. `switchTab` mantido.

**Steps:**
- [ ] Adicionar as rotas-raiz novas e derivar `TAB_ROOTS`/conteúdo do `perfil`. Mapear telas existentes para as abas (ver spec, tabela de navegação).
- [ ] `TabBar`: 4 itens, ícone + label, aba ativa com pill verde (mockups).
- [ ] `Router`: gatear por sessão e renderizar a aba certa por persona.
- [ ] Verificar: `npx tsc --noEmit` zero. Login → cada persona cai na sua aba inicial e as 4 abas trocam.
- [ ] Commit: `feat(nav): navegação de 4 abas por perfil`.

---

### Task 4: Login por persona (sem credenciais)

**Files:**
- Modify: `src/screens/LoginScreen.tsx`, `src/auth/AuthContext.tsx`, `src/auth/AuthProvider.ts`, `src/auth/mockAuthProvider.ts`

**Steps:**
- [ ] Tela: logo CAR Campo + "Bem-vindo" + tagline; **Eu sou:** dois cards (Produtor Rural / Analista de Campo). **Sem e-mail/senha.** Tocar no card faz login mock da persona e entra direto.
- [ ] Auth: adicionar `loginComoProdutor()` / `loginComoAnalista()` (ou `loginPersona(perfil)`) no seam mock, reaproveitando o que já existe.
- [ ] Verificar: `npx tsc --noEmit` zero. Cada card entra direto na persona.
- [ ] Commit: `feat(auth): login direto por persona sem credenciais`.

---

### Task 5 (paralelo): Produtor — Dashboard

**Files:** Modify `src/screens/HomeScreen.tsx`.
**Ref:** `design/produtor/01-dashboard.png`, spec P1.

**Steps:**
- [ ] Reconstruir como Dashboard: saudação, card **Meus Terrenos** (foto/selo/hectares/solo/última medição/CAR), **Ações Rápidas** (Iniciar Nova Medição em destaque + Consultar Documentos + Visualizar Mapas), **Documentos Recentes**, **Histórico de Medições** (status OK + Ver Detalhes do Perímetro), FAB. Dados reais do `store`.
- [ ] Verificar: `npx tsc --noEmit` zero. Render com dados do produtor logado.
- [ ] Commit: `feat(produtor): dashboard no novo design`.

---

### Task 6 (paralelo): Produtor — Medição/Mapa (preservar mecânica)

**Files:** Modify `src/screens/DemarcacaoScreen.tsx` (apenas HUD/estilo).
**Ref:** `design/produtor/02-medicao-mapa.png`, spec P2. **Executor: agente `geo`.**

**Steps:**
- [ ] Restilizar HUD: card **Área Atual** (ha + perímetro), chips **Precisão GPS** e **Acelerômetro**, controles de mapa (+/−/centralizar/camadas), botões **Finalizar Perímetro** (outlined) e **Marcar Ponto** (verde sólido).
- [ ] **NÃO alterar** `usePerimeterTracker`/`useSimulatedWalk`/cálculo geodésico/GeoJSON. Só apresentação.
- [ ] Verificar: `npx tsc --noEmit` zero. Marcar ponto / finalizar perímetro continua funcionando (real e simulado).
- [ ] Commit: `feat(produtor): HUD da medição no novo design (mecânica intacta)`.

---

### Task 7 (paralelo): Produtor — Análise de Confrontação

**Files:** Modify `src/screens/AlteracaoDetalheScreen.tsx`.
**Ref:** `design/produtor/03-analise-confrontacao.png`, spec P3.

**Steps:**
- [ ] Mapa com banner **STATUS: CRÍTICO – DIVERGÊNCIA DE ÁREA**, toggle "Dados Governo", título **Análise de Confrontação**, blocos **Área Produtor** (com "Surveying L2 Precision" em azul `tertiary`) × **Área Governo**. Usar `lib/alteracao.ts`/`lib/delta.ts` (delta já calculado).
- [ ] Verificar: `npx tsc --noEmit` zero.
- [ ] Commit: `feat(produtor): análise de confrontação no novo design`.

---

### Task 8 (paralelo): Analista — Painel

**Files:** Modify `src/screens/PainelScreen.tsx` (+ consumir dados de `ValidacaoScreen`).
**Ref:** `design/analista/01-painel.png`, spec A1.

**Steps:**
- [ ] "Painel do Analista": contagem de alertas, Filtrar + Nova Medição, card vermelho **Alertas de Divergência** (Agendar Visita / Ver Detalhes), **Média de Divergência**, **Pendências de Validação** (lista + "N Novos"), **Visitas Agendadas** (mini-calendário horizontal + itens horário/local). Dados de `store`+`overlay`+`alteracao`+`conferencia`.
- [ ] Verificar: `npx tsc --noEmit` zero.
- [ ] Commit: `feat(analista): painel no novo design`.

---

### Task 9 (paralelo): Analista — Medições/Conferência (legenda colorida)

**Files:** Modify `src/screens/ConferenciaLabScreen.tsx`, `src/screens/ValidacaoScreen.tsx`.
**Ref:** spec A-Medições + bloco "Legenda da conferência". **Executor: agente `geo`** (mexe em mapa).

**Steps:**
- [ ] Triagem (ValidacaoScreen) e conferência no novo design system.
- [ ] **Legenda + polígonos**: **Medição Produtor** = azul preenchido (`tertiary #00A8E8`), **Dados Governo** = vermelho contornado (`critico #a3302a`), **Medição Analista** = verde (`primary`). Legenda e mapa consistentes.
- [ ] **NÃO alterar** a mecânica de simulação/delta. Só apresentação + cores.
- [ ] Verificar: `npx tsc --noEmit` zero. Conferência simula e decide normalmente.
- [ ] Commit: `feat(analista): conferência e triagem no novo design + legenda colorida`.

---

### Task 10 (paralelo): Analista — Agendar Visita Técnica

**Files:** Modify `src/screens/VisitasScreen.tsx`, evoluir `src/ui/CalendarModal.tsx` para tela.
**Ref:** `design/analista/02-agendar-visita.png`, spec A2.

**Steps:**
- [ ] Tela "Agendar Visita Técnica": header "AÇÃO NECESSÁRIA", calendário de mês, **Observações** (textarea), **Horários Disponíveis** (grade de slots, um desabilitado), card **Local da Visita**, **Confirmar Agendamento**. Persistir em `VisitaAgendada` (`dataVisita`, `periodo`/slot, observação).
- [ ] Verificar: `npx tsc --noEmit` zero. Agendar grava e reflete no Painel.
- [ ] Commit: `feat(analista): tela de agendamento de visita técnica`.

---

### Task 11 (paralelo): Documento CAR (compartilhado)

**Files:** Modify `src/screens/DocumentosScreen.tsx`.
**Ref:** `design/shared/01-documento-car.png`, spec S1.

**Steps:**
- [ ] Detalhe do documento: breadcrumb, título **CAR** + selo Validado, Compartilhar/Baixar PDF, **Visualização**, **Histórico de Versões**, métricas **Área Total/Reserva Legal/APP**, abas (Dados/Domínio/Uso), mapa SIRGAS, **Checklist de Conformidade**. Reusar `lib/export.ts` (PDF existe).
- [ ] Verificar: `npx tsc --noEmit` zero.
- [ ] Commit: `feat(documentos): detalhe do CAR no novo design`.

---

### Task 12: Verificação final

**Steps:**
- [ ] `npx tsc --noEmit` zero no projeto inteiro.
- [ ] App sobe no Metro; percorrer: login produtor → 4 abas (dashboard/medição-perímetro/documentos/perfil); login analista → 4 abas (painel/conferência/agenda/documentos).
- [ ] Confirmar mecânica de perímetro (marcar ponto, finalizar, área) intacta.
- [ ] Commit final se houver ajustes: `chore: ajustes finais do redesign`.

## Self-Review

- **Cobertura do spec:** design system (T1-2), nav (T3), login (T4), P1-P3 (T5-7), A1-A2 (T8,10), conferência+legenda (T9), doc CAR (T11), testes removidos (T0). ✔
- **Sem placeholders:** cada task tem arquivos + critério de verificação concretos. ✔
- **Dependências:** T0→T1→T2→T3/T4 antes das telas (T5-11). Telas são paralelas entre si. ✔
- **Preservação:** T6 e T9 marcadas para o agente `geo`, com proibição de tocar a mecânica. ✔
