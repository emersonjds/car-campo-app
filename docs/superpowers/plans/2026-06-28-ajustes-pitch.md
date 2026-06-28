# Ajustes para o pitch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajustar app e API para a demonstração: checklist com tags + mapa em 1º, link do PDF acessível na web, "Concluir" leva à Home, notificações só informativas.

**Architecture:** Mudanças localizadas. App (`car-campo-app`): dado do checklist + render, extração do fluxo de visita, botão Concluir, feed de notificações. API (`car-geo-api`): uma rota HTML nova de visualização. Sem libs novas.

**Tech Stack:** React Native + Expo (TS), Fastify + PostGIS (TS).

## Global Constraints

- Sem dependências novas em nenhum dos repos.
- Verificação por tarefa: `npx tsc --noEmit` no repo afetado (não há test runner). Rota da API também por `curl`.
- Commits micro, conventional-commit em pt-br, minúsculos, sem ponto final, **sem nenhum traço de LLM** (sem Co-Authored-By, sem 🤖, sem menção a IA). Autor é o usuário.
- App: `app.json > extra.apiBaseUrl` já = `https://car-geo-api.onrender.com` (não reverter).
- LGPD: PDF do link usa CPF mascarado (`uploadPDFLink` já passa `maskPii=true`).

---

### Task 0: Remover toda a parte do analista (foco no produtor)

> Maior mudança estrutural — feita primeiro. Executada pelo subagent `front`
> (refactor acoplado em RN). Critério de pronto: `npx tsc --noEmit` PASS e app
> abre direto no produtor.

**Files:**
- Delete: `src/screens/ValidacaoScreen.tsx`, `src/screens/PainelScreen.tsx`, `src/screens/ConferenciaLabScreen.tsx`
- Modify: `src/types.ts`, `src/app/TabBar.tsx`, `src/app/Router.tsx`, `src/app/navigation.tsx`, `src/auth/AuthContext.tsx`, `src/auth/mockAuthProvider.ts`, `src/auth/types.ts`, `src/screens/LoginScreen.tsx`, `src/screens/ConfigScreen.tsx`, `src/lib/seed.demo.ts`, `src/screens/RevisaoScreen.tsx`, `src/lib/visita.ts` (criada na Task 2), `src/screens/VisitasScreen.tsx`, `src/screens/AgendarVisitaScreen.tsx`
- **NÃO apagar (compartilhado):** `src/lib/conferencia.ts`, `src/lib/alteracao.ts`, `src/lib/delta.ts`, `src/lib/credito.ts`, `src/lib/docHub.ts`

**Decisões:** login só do produtor (gov.br); Visitas/AgendarVisita ficam como visão do produtor; apagar arquivos analista-only.

- [ ] **Step 1: Apagar as 3 telas de analista**

```bash
git rm src/screens/ValidacaoScreen.tsx src/screens/PainelScreen.tsx src/screens/ConferenciaLabScreen.tsx
```

- [ ] **Step 2: `Perfil = 'produtor'`**

`src/types.ts`: `export type Perfil = 'produtor';` (remover `'analista'`).

- [ ] **Step 3: TabBar só produtor**

`src/app/TabBar.tsx`: remover `TABS_ANALISTA`; `tabsForPerfil` retorna sempre `TABS_PRODUTOR` (pode simplificar removendo o parâmetro se não usado em outro lugar — conferir chamadas).

- [ ] **Step 4: Router sem rotas de analista**

`src/app/Router.tsx`: remover imports e `case`s de `validacao`, `painel`, `conferencia-lab`; trocar o `case 'medicoes'` para sempre `return <MedicoesScreen />;` (remover o branch por perfil e o import de `ValidacaoScreen`).

- [ ] **Step 5: navigation.tsx sem RouteNames de analista**

`src/app/navigation.tsx`: remover os `RouteName`/variantes `validacao`, `painel`, `conferencia-lab` do union de `Route`, e qualquer derivação de perfil que assuma analista (perfil sempre `'produtor'`).

- [ ] **Step 6: Auth só produtor**

`src/auth/types.ts`, `src/auth/AuthContext.tsx`, `src/auth/mockAuthProvider.ts`: remover o método/branch de login por matrícula (analista). Manter `loginGovBr` (produtor). A sessão resultante tem `perfil: 'produtor'`.

- [ ] **Step 7: LoginScreen só gov.br**

`src/screens/LoginScreen.tsx`: remover a UI/estado do login de analista (campos matrícula+senha, toggle de perfil). Deixar só o fluxo gov.br do produtor.

- [ ] **Step 8: ConfigScreen sem ramo analista**

`src/screens/ConfigScreen.tsx`: remover condicionais que mostram identidade de analista; mostrar só a do produtor.

- [ ] **Step 9: seed.demo.ts**

`src/lib/seed.demo.ts`: remover seeds que só fazem sentido para o analista (se houver). Manter os imóveis/medições do produtor.

- [ ] **Step 10: Textos "fila do analista"**

Trocar menções a "analista/fila do analista" por texto neutro ("solicitação enviada", "pedido registrado") em `RevisaoScreen.tsx`, `VisitasScreen.tsx`, `AgendarVisitaScreen.tsx` (e em `visita.ts` quando criada na Task 2).

- [ ] **Step 11: Typecheck e abrir o app mentalmente**

Run: `npx tsc --noEmit`
Expected: PASS, sem símbolos órfãos (`TABS_ANALISTA`, `ValidacaoScreen`, `Perfil 'analista'`). Conferir que nenhuma rota/aba de analista permanece.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor(app): remove a parte do analista, foco no produtor"
```

---

### Task 1: Modelo de status do checklist + reordenar

**Files:**
- Modify: `src/lib/checklistCAR.ts`

**Interfaces:**
- Produces: `type StatusPasso = 'feito-app' | 'voce-ja-tem' | 'a-fazer' | 'em-analise'`; `PassoCAR` ganha `status: StatusPasso` e `solicitarTecnico?: boolean`; remove `jaCobertoPeloApp`.

- [ ] **Step 1: Editar a interface e o array**

Em `src/lib/checklistCAR.ts`, trocar `jaCobertoPeloApp: boolean;` por:

```ts
export type StatusPasso = 'feito-app' | 'voce-ja-tem' | 'a-fazer' | 'em-analise';
```

e na interface `PassoCAR`:

```ts
  status: StatusPasso;
  solicitarTecnico?: boolean;
```

(remover a linha `jaCobertoPeloApp: boolean;`).

- [ ] **Step 2: Reordenar e atribuir status**

Reordenar o array `CHECKLIST_CAR_OFICIAL` nesta ordem e trocar cada `jaCobertoPeloApp: …` pelo `status` correspondente (mantendo todo o resto de cada objeto igual):

1. `perimetro-gps` → `status: 'feito-app'`
2. `cpf-responsavel` → `status: 'voce-ja-tem'`
3. `documento-da-terra` → `status: 'voce-ja-tem'`
4. `ccir-quitado` → `status: 'a-fazer'`
5. `croqui-app-reserva-legal` → `status: 'a-fazer'`
6. `inscricao-sicar` → `status: 'a-fazer'`
7. `georreferenciamento-incra-sigef` → `status: 'a-fazer', solicitarTecnico: true`
8. `analise-orgao-estadual` → `status: 'em-analise'`

- [ ] **Step 3: Typecheck (vai falhar no DocumentosScreen — esperado)**

Run: `npx tsc --noEmit`
Expected: erro só em `DocumentosScreen.tsx` (usa `jaCobertoPeloApp`). `checklistCAR.ts` sem erro. Corrigido na Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/lib/checklistCAR.ts
git commit -m "feat(checklist): status com tags e mapa em primeiro"
```

---

### Task 2: Extrair fluxo de solicitar visita para lib

**Files:**
- Create: `src/lib/visita.ts`
- Modify: `src/screens/RevisaoScreen.tsx` (usar a lib)

**Interfaces:**
- Consumes: `updateImovel` (`src/lib/store`), `submitPerimeter` (`src/lib/api`), tipos `Imovel`, `MotivoVisita`, `SolicitacaoVisita` (`src/types`).
- Produces: `async function solicitarVisitaTecnico(imovel: Imovel, motivo: MotivoVisita, detalhe: string): Promise<Imovel | null>` — grava `solicitacaoVisita` + `status='enviado'` no store e faz best-effort `submitPerimeter`. Retorna o imóvel atualizado.

- [ ] **Step 1: Criar `src/lib/visita.ts`**

```ts
import { updateImovel } from './store';
import { submitPerimeter } from './api';
import type { Imovel, MotivoVisita, SolicitacaoVisita } from '../types';

/**
 * Registra a solicitação de visita do técnico: grava no store (offline-first)
 * e tenta publicar o perímetro preliminar na CAR Geo API (best-effort, nunca
 * bloqueia por falta de rede). Retorna o imóvel atualizado, ou null se sumiu.
 */
export async function solicitarVisitaTecnico(
  imovel: Imovel,
  motivo: MotivoVisita,
  detalhe: string,
): Promise<Imovel | null> {
  const sol: SolicitacaoVisita = { solicitadaEm: Date.now(), motivo, detalhe };
  const updated = await updateImovel(imovel.id, {
    solicitacaoVisita: sol,
    status: 'enviado',
  });

  const { imovel: dados, produtor, geometry } = imovel;
  const properties: Record<string, unknown> = {
    nome: dados.nome,
    municipio: dados.municipio,
    uf: dados.uf,
    produtor_nome: produtor.nome,
    ...(dados.matricula ? { matricula: dados.matricula } : {}),
    ...(dados.modulosFiscais != null ? { modulos_fiscais: dados.modulosFiscais } : {}),
  };
  await submitPerimeter(geometry.points, properties).catch(() => {});

  return updated;
}
```

Conferir os nomes exatos de import com o topo de `RevisaoScreen.tsx` antes de salvar (ex.: `submitPerimeter`, `updateImovel`). Ajustar caminho/spread se a assinatura real divergir.

- [ ] **Step 2: Usar a lib em `RevisaoScreen.tsx`**

Em `handleSolicitarVisita`, dentro de `pedir`, substituir o bloco inline (montar `sol`, `updateImovel`, montar `properties`, `submitPerimeter`) por:

```ts
const updated = await solicitarVisitaTecnico(imovel, motivo, detalhe);
if (updated) setImovel(updated);
```

mantendo o `Alert.alert('Visita solicitada', …, [{ text: 'Ok', onPress: () => switchTab({ name: 'home' }) }])` logo depois. Adicionar o import `import { solicitarVisitaTecnico } from '../lib/visita';` e remover imports que ficarem sem uso (`submitPerimeter` se não usado em outro lugar do arquivo — conferir com grep antes).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem novos erros vindos de `visita.ts`/`RevisaoScreen.tsx` (o erro pendente da Task 1 no DocumentosScreen pode continuar).

- [ ] **Step 4: Commit**

```bash
git add src/lib/visita.ts src/screens/RevisaoScreen.tsx
git commit -m "refactor(visita): extrai solicitarVisitaTecnico para lib reutilizável"
```

---

### Task 3: Render das tags + botão "Solicitar técnico" no checklist

**Files:**
- Modify: `src/screens/DocumentosScreen.tsx` (componente `PassoRow`)

**Interfaces:**
- Consumes: `PassoCAR.status`, `PassoCAR.solicitarTecnico` (Task 1); `solicitarVisitaTecnico` (Task 2).

- [ ] **Step 1: Reescrever `PassoRow` para usar `status`**

Substituir a lógica que usa `passo.jaCobertoPeloApp`. Definir um mapa de tag por status e renderizar:

```tsx
const TAG: Record<StatusPasso, { texto: string; ok: boolean; cor: string }> = {
  'feito-app':   { texto: 'Adiantado pela sua medição', ok: true,  cor: colors.primary },
  'voce-ja-tem': { texto: 'Você já tem',                ok: true,  cor: colors.primary },
  'a-fazer':     { texto: 'A fazer',                    ok: false, cor: colors.mutedText },
  'em-analise':  { texto: 'Em análise',                 ok: false, cor: colors.aviso },
};
```

No corpo do `PassoRow`, usar `const tag = TAG[passo.status];` e `const feito = tag.ok;` para o check (mantendo o círculo `passoCheck`/`passoCheckOk`). Trocar a linha verde fixa `{feito ? <Text style={s.passoOk}>Adiantado pela sua medição</Text> : null}` por uma tag colorida conforme `tag`:

```tsx
<View style={[s.passoTag, { backgroundColor: `${tag.cor}1f` }]}>
  <Text style={[s.passoTagTxt, { color: tag.cor }]}>{tag.texto}</Text>
</View>
```

Importar `StatusPasso` de `../lib/checklistCAR`. Adicionar estilos `passoTag` (alinhado à esquerda, `alignSelf:'flex-start'`, `borderRadius:6`, `paddingHorizontal:8`, `paddingVertical:2`, `marginTop:4`) e `passoTagTxt` (`fontSize:11`, `fontWeight:'700'`).

- [ ] **Step 2: Botão "Solicitar técnico" quando `solicitarTecnico`**

No `PassoRow`, quando `passo.solicitarTecnico`, renderizar abaixo da tag um botão que dispara o fluxo. Como `PassoRow` hoje não tem acesso ao imóvel, passar uma prop opcional `onSolicitarTecnico?: () => void` e renderizar:

```tsx
{passo.solicitarTecnico && onSolicitarTecnico ? (
  <TouchableOpacity onPress={onSolicitarTecnico} style={s.btnTecnico} accessibilityRole="button">
    <Text style={s.btnTecnicoTxt}>Solicitar técnico</Text>
  </TouchableOpacity>
) : null}
```

Estilos `btnTecnico` (borda `colors.primary`, `borderRadius:8`, `paddingHorizontal:10`, `paddingVertical:4`, `alignSelf:'flex-start'`, `marginTop:6`) e `btnTecnicoTxt` (`fontSize:12`, `fontWeight:'600'`, `color: colors.primary`).

Cuidado: o `<Ionicons information-circle>` à direita e o botão não devem brigar pelo toque — manter o botão dentro do `itemInfo`, não do `TouchableOpacity` externo (extrair o conteúdo do passo de modo que o botão seja clicável independente). Se necessário, trocar o `TouchableOpacity` externo do `PassoRow` por `View` e mover o "abrir info" para o ícone `information-circle` (`TouchableOpacity` próprio).

- [ ] **Step 3: Ligar o handler no `DocumentosScreen`**

Onde o `.map` renderiza `<PassoRow key={passo.id} passo={passo} />`, passar:

```tsx
<PassoRow
  key={passo.id}
  passo={passo}
  onSolicitarTecnico={
    passo.solicitarTecnico && temMedicao
      ? () =>
          Alert.alert('Solicitar técnico', 'Pedir visita do técnico para a medição oficial?', [
            {
              text: 'Solicitar',
              onPress: async () => {
                await solicitarVisitaTecnico(imovel, 'medicao', 'Solicitação de técnico para medição oficial (checklist CAR).');
                Alert.alert('Pronto', 'Solicitação enviada para a fila do analista.');
              },
            },
            { text: 'Cancelar', style: 'cancel' },
          ])
      : undefined
  }
/>
```

Importar `solicitarVisitaTecnico` de `../lib/visita`. `'medicao'` deve bater com o tipo `MotivoVisita` — conferir em `src/types.ts`; se o valor for outro, usar o correto.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (resolve o erro pendente da Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/screens/DocumentosScreen.tsx
git commit -m "feat(checklist): tags por status e ação solicitar técnico"
```

---

### Task 4: Rota web de visualização do PDF + app aponta pra ela

**Files:**
- Modify: `car-geo-api/apps/api/src/routes/index.ts` (nova rota)
- Modify: `car-campo-app/src/lib/export.ts` (`uploadPDFLink`)

**Interfaces:**
- Consumes: `getDocument(id)` → `{ nome: string|null; mime: string; bytes: Buffer } | null`; `UUID_RE`, `publicOrigin(req)` (já no arquivo de rotas).

- [ ] **Step 1: Adicionar `GET /documentos/:id/ver` na API**

Logo após a rota `GET /documentos/:id` em `routes/index.ts`, adicionar:

```ts
// Página web de visualização (pitch/desktop) — embute o PDF servido em /:id.
app.get<{ Params: { id: string } }>('/documentos/:id/ver', async (req, reply) => {
  if (!UUID_RE.test(req.params.id)) {
    return reply.code(404).type('text/html').send('<h1>Documento não encontrado</h1>');
  }
  const doc = await getDocument(req.params.id);
  if (!doc) return reply.code(404).type('text/html').send('<h1>Documento não encontrado</h1>');
  const pdf = `${publicOrigin(req)}/documentos/${req.params.id}`;
  const nome = (doc.nome ?? 'Medição CAR Campo').replace(/[<>&"]/g, '');
  const html = `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nome} · CAR Campo</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0e1b12;color:#e9f0ea}
  header{display:flex;align-items:center;gap:10px;padding:14px 20px;background:#16321f}
  header b{font-size:16px} header span{color:#9bbfa6;font-size:13px}
  main{max-width:960px;margin:0 auto;padding:16px}
  iframe{width:100%;height:78vh;border:0;border-radius:10px;background:#fff}
  a.btn{display:inline-block;margin-top:12px;padding:10px 18px;background:#2d5a27;color:#fff;text-decoration:none;border-radius:8px;font-weight:600}
</style></head><body>
<header><span>🌿</span><b>CAR Campo</b><span>· Medição preliminar</span></header>
<main>
  <iframe src="${pdf}" title="${nome}"></iframe>
  <a class="btn" href="${pdf}" download>Baixar PDF</a>
</main></body></html>`;
  return reply.type('text/html').send(html);
});
```

- [ ] **Step 2: Typecheck da API**

Run (no repo da API): `cd ../car-geo-api/apps/api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Smoke test local da rota (se conseguir subir a API) ou anotar p/ deploy**

Se a API local estiver no ar: criar um doc via `POST /documentos` e abrir `…/documentos/<id>/ver` — deve retornar HTML 200 com `<iframe>`. Se não subir local, registrar que a verificação real ocorre após deploy no Render.

- [ ] **Step 4: App — `uploadPDFLink` retorna a URL `/ver`**

Em `car-campo-app/src/lib/export.ts`, na última linha de `uploadPDFLink`, trocar:

```ts
return (await res.json()).url as string;
```

por:

```ts
const { url } = (await res.json()) as { url: string };
return `${url}/ver`;
```

- [ ] **Step 5: Typecheck do app**

Run (no repo do app): `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commits (um por repo)**

```bash
# repo da API
cd ../car-geo-api && git add apps/api/src/routes/index.ts && \
  git commit -m "feat(documentos): página web de visualização do pdf por id"
# repo do app
cd ../car-campo-app && git add src/lib/export.ts && \
  git commit -m "feat(export): link do pdf abre a página de visualização"
```

---

### Task 5: Botão "Concluir" na Revisão leva à Home

**Files:**
- Modify: `src/screens/RevisaoScreen.tsx`

- [ ] **Step 1: Adicionar o botão**

Na `submitSection` ao fim do `ScrollView` (onde hoje só há `SecondaryButton label="Voltar"`), adicionar acima do "Voltar" um botão primário:

```tsx
<View style={s.btnRow}>
  <PrimaryButton label="Concluir" onPress={() => switchTab({ name: 'home' })} disabled={isBusy} />
</View>
<View style={[s.btnRow, { marginTop: 8 }]}>
  <SecondaryButton label="Voltar" onPress={goBack} disabled={isBusy} />
</View>
```

`switchTab` já está disponível no componente (usado no fluxo de visita). Conferir o import/uso.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/screens/RevisaoScreen.tsx
git commit -m "feat(revisao): botão concluir leva o produtor para a home"
```

---

### Task 6: Notificações só informativas (remover crítico/vermelho)

**Files:**
- Modify: `src/screens/NotificacoesScreen.tsx`

- [ ] **Step 1: Remover o tipo `critico` e as divergências**

- No union: `type Tipo = 'documento' | 'visita' | 'sistema' | 'lembrete';` (remover `'critico'`).
- No mapa `TIPO`: remover a entrada `critico`.
- No `useMemo` de `notifs`: remover o bloco que deriva `divergencias` de `alertaDivergencia`; retornar só `DEMO`. Remover o uso de `imoveis`/`listImoveis` se ficarem órfãos (e o `useState`/`useEffect` correspondentes).
- Remover `badge`/`badge: 'CRÍTICO'` dos itens (nenhum DEMO usa, mas garantir que nada renderize badge vermelho).

- [ ] **Step 2: Trocar os DEMO para o tom informativo pedido**

Ajustar `DEMO` para refletir "licenças liberadas, documentos aprovados, visita confirmada". Exemplo de itens (manter 4–5, grupos HOJE/ANTERIORES):

```ts
const DEMO: Notif[] = [
  { id: 'demo-licenca', tipo: 'documento', titulo: 'Licença ambiental liberada',
    descricao: 'A licença ambiental da Propriedade Vale Verde foi liberada pelo órgão estadual.',
    quando: '11:28', grupo: 'hoje', rota: { name: 'documentos-hub' } },
  { id: 'demo-doc', tipo: 'documento', titulo: 'Documento aprovado',
    descricao: 'O laudo técnico ambiental foi aprovado e anexado ao processo.',
    quando: '10:02', grupo: 'hoje', rota: { name: 'documentos-hub' } },
  { id: 'demo-visita', tipo: 'visita', titulo: 'Visita técnica confirmada',
    descricao: 'O técnico confirmou a visita de campo para a medição oficial.',
    quando: '09:14', grupo: 'hoje', rota: { name: 'visitas' } },
  { id: 'demo-sistema', tipo: 'sistema', titulo: 'CAR em análise',
    descricao: 'A inscrição no SICAR está em análise no órgão ambiental — já vale para crédito rural.',
    quando: 'Ontem, 18:30', grupo: 'anteriores' },
  { id: 'demo-lembrete', tipo: 'lembrete', titulo: 'Lembrete',
    descricao: 'Leve o PDF da medição preliminar na visita do técnico.',
    quando: '21 Mai', grupo: 'anteriores' },
];
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, sem imports/variáveis órfãos (`colors.critico`, `listImoveis`, `Imovel` se não usados — remover).

- [ ] **Step 4: Commit**

```bash
git add src/screens/NotificacoesScreen.tsx
git commit -m "feat(notificacoes): feed só informativo, sem alerta crítico"
```

---

## Self-Review

- **Cobertura do spec:** A→Task 1+3, B→Task 4, C→Task 5, D→Task 6, reuso visita→Task 2. ✓
- **Sem placeholders:** todos os steps com código real. ✓
- **Consistência de tipos:** `StatusPasso` definido na Task 1 e consumido nas Tasks 1/3; `solicitarVisitaTecnico` definido na Task 2 e consumido nas Tasks 2/3. `MotivoVisita 'medicao'` a confirmar em `src/types.ts` na execução. ✓
