# Central de Documentos + Regularidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a aba Documentos o centralizador das propriedades — sincronizar (mock gov.br) os documentos digitais ao abrir cada imóvel e avisar quando documentos faltando + área em risco podem impedir crédito/financiamento.

**Architecture:** Um módulo puro `src/lib/docHub.ts` (catálogo + sync mock + avaliação de regularidade), mudanças mínimas em `types.ts`, e integração nas telas `DocumentosScreen` (auto-sync + banner) e `DocumentosHubScreen` (chip de regularidade). Offline-first; gov.br segue mockado num seam isolado.

**Tech Stack:** React Native 0.85 / Expo SDK 56 / React 19 / TypeScript. Sem framework de teste: self-checks com `node:assert` rodados via `bun <arquivo>`.

## Global Constraints

- Offline-first: nada bloqueia por rede; `sincronizarDocumentos` nunca lança (retorna `[]` em falha).
- Sem traço de LLM em commits (sem `Co-Authored-By`, sem emoji 🤖). Autor: Emerson Silva. Mensagens conventional-commit pt-br, minúsculas, sem ponto final.
- Escopo: apenas perfil produtor / fluxo Documentos. Nenhum envio à API.
- Funções de lógica (`documentosDisponiveis`, `mergeDocumentos`, `avaliarRegularidade`) são puras e síncronas.
- `DocumentoTipo` já contém os tipos digitais (`car`, `car-extrato`, `ccir`, `sigef`, `matricula`, `caf`, `itr`, `licenca`) — não inventar novos.
- Rodar `npx tsc --noEmit` ao fim de cada task com mudança de tipo; deve sair limpo.

---

### Task 1: Módulo `docHub.ts` + tipos + origem manual

**Files:**
- Modify: `src/types.ts` (interface `Documento`, interface `Imovel`)
- Modify: `src/lib/documents.ts` (3 criadores setam `origem: 'manual'`)
- Create: `src/lib/docHub.ts`
- Test: `src/lib/docHub.test.ts`

**Interfaces:**
- Consumes: `Imovel`, `Documento`, `DocumentoTipo` de `../types`; `DeltaRelatorio` de `./delta` (campos `delta_ha`, `acrescido_ha`).
- Produces:
  - `CATALOGO_DIGITAL: Record<DocumentoTipo, DocMeta>`
  - `documentosDisponiveis(imovel: Imovel): Documento[]` (puro)
  - `mergeDocumentos(existing: Documento[], novos: Documento[]): Documento[]` (puro)
  - `sincronizarDocumentos(imovel: Imovel): Promise<Documento[]>` (async; devolve array já mesclado)
  - `avaliarRegularidade(imovel: Imovel): RegularidadeImovel` (puro)
  - tipos `DocMeta`, `RegularidadeImovel`, `NivelRegularidade`, const `OBRIGATORIOS_CREDITO`

- [ ] **Step 1: Estender os tipos em `src/types.ts`**

Em `interface Documento`, trocar `uri: string` por opcional e adicionar campos de origem (logo após o bloco `lat?/lng?`):

```ts
export interface Documento {
  id: string;
  tipo: DocumentoTipo;
  /** URI do arquivo no sandbox (file://...). Ausente em docs sincronizados (metadados gov.br). */
  uri?: string;
  nome: string;
  mime?: string;
  lat?: number;
  lng?: number;
  /** Procedência do documento. Default 'manual' (anexado pelo produtor). */
  origem?: 'govbr' | 'manual';
  /** Órgão emissor — preenchido para origem 'govbr' (ex.: "SICAR / Meu Imóvel Rural"). */
  orgao?: string;
  /** Data de emissão (epoch ms) — preenchido para origem 'govbr'. */
  emitidoEm?: number;
  createdAt: number;
}
```

Em `interface Imovel`, adicionar após `documentos: Documento[];`:

```ts
  /** Epoch ms da última sincronização de documentos com o gov.br (mock). */
  documentosSincronizadosEm?: number;
```

- [ ] **Step 2: Marcar docs manuais em `src/lib/documents.ts`**

Nos três `return { id: genId(), tipo, uri, nome, ... }` (em `pickFromLibrary`, `takePhoto`, `pickDocument`), adicionar `origem: 'manual',` logo após `tipo,`. Exemplo em `pickFromLibrary`:

```ts
  return {
    id: genId(),
    tipo,
    origem: 'manual',
    uri,
    nome: nomeOriginal,
    mime: asset.mimeType ?? 'image/jpeg',
    createdAt: Date.now(),
  };
```

(Repetir o `origem: 'manual',` nos returns de `takePhoto` e `pickDocument`.)

- [ ] **Step 3: Escrever o teste que falha — `src/lib/docHub.test.ts`**

```ts
import assert from 'node:assert';
import {
  documentosDisponiveis,
  mergeDocumentos,
  avaliarRegularidade,
  OBRIGATORIOS_CREDITO,
} from './docHub';
import type { Imovel, Documento } from '../types';

// Imóvel base de teste: tem carNumero, matrícula e geometria (3+ pontos).
function imovelBase(over: Partial<Imovel> = {}): Imovel {
  const base: Imovel = {
    id: 't1',
    perfil: 'produtor',
    produtor: { nome: 'Teste', cpfCnpj: '123.456.789-00' },
    imovel: { nome: 'Sítio Teste', municipio: 'Sorriso', uf: 'MT', matricula: '12.345', carNumero: 'MT-X-0001' },
    geometry: { points: [{ longitude: -55, latitude: -12 }, { longitude: -55.01, latitude: -12 }, { longitude: -55, latitude: -12.01 }], area_ha: 40, perimetro_m: 2600 },
    documentos: [],
    status: 'rascunho',
    createdAt: 0,
    updatedAt: 0,
  };
  return { ...base, ...over };
}

// 1) sync de imóvel com CAR + matrícula + geometria inclui os digitais esperados, sem caf/licenca
const disp = documentosDisponiveis(imovelBase());
const tipos = disp.map((d) => d.tipo).sort();
assert.deepStrictEqual(tipos, ['car', 'car-extrato', 'ccir', 'matricula', 'sigef'].sort());
assert.ok(disp.every((d) => d.origem === 'govbr' && d.orgao && d.uri === undefined), 'docs govbr são metadados');

// 2) merge não duplica tipo já presente (manual prevalece)
const manualMat: Documento = { id: 'm1', tipo: 'matricula', origem: 'manual', uri: 'file://x', nome: 'minha.pdf', createdAt: 0 };
const merged = mergeDocumentos([manualMat], disp);
const mats = merged.filter((d) => d.tipo === 'matricula');
assert.strictEqual(mats.length, 1, 'uma só matrícula');
assert.strictEqual(mats[0]!.origem, 'manual', 'manual prevalece');
// re-sync idempotente: mesclar de novo não cresce
assert.strictEqual(mergeDocumentos(merged, disp).length, merged.length, 're-sync não duplica');

// 3) regularidade: sem docs obrigatórios → pendente e impacta crédito
const r0 = avaliarRegularidade(imovelBase());
assert.deepStrictEqual(r0.docsObrigatoriosFaltando.sort(), [...OBRIGATORIOS_CREDITO].sort());
assert.notStrictEqual(r0.nivel, 'regular');
assert.strictEqual(r0.podeImpactarCredito, true);

// com todos os obrigatórios e sem área em risco → regular
const comDocs = imovelBase({ documentos: OBRIGATORIOS_CREDITO.map((t, i) => ({ id: `d${i}`, tipo: t, origem: 'govbr', orgao: 'x', nome: t, createdAt: 0 })) });
const rOk = avaliarRegularidade(comDocs);
assert.strictEqual(rOk.nivel, 'regular');
assert.strictEqual(rOk.podeImpactarCredito, false);
assert.strictEqual(rOk.haEmRisco, 0);

// 4) haEmRisco reflete alertaDivergencia.delta_ha
const rRisco = avaliarRegularidade(imovelBase({ alertaDivergencia: { detectadoEm: 0, delta_ha: 7.1, delta_pct: 22, severidade: 'critico', visto: false } }));
assert.strictEqual(rRisco.haEmRisco, 7.1);
assert.strictEqual(rRisco.nivel, 'critico');

console.log('docHub.test: OK');
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

Run: `bun src/lib/docHub.test.ts`
Expected: FAIL (`Cannot find module './docHub'` ou export ausente).

- [ ] **Step 5: Implementar `src/lib/docHub.ts`**

```ts
// Central de documentos do imóvel rural: catálogo dos documentos digitais,
// sincronização mock com o gov.br/SICAR/INCRA e avaliação de regularidade
// (documentos faltando + área em risco) para o aviso de crédito.
//
// SEAM: integração gov.br real (OIDC+PKCE + WFS/REST governamental) entra em
// `sincronizarDocumentos`. Hoje é mock determinístico, offline-first.
import type { Documento, DocumentoTipo, Imovel } from '../types';

export type NivelRegularidade = 'regular' | 'pendente' | 'critico';

export interface DocMeta {
  label: string;
  orgao: string;
  /** true = sincronizável via gov.br no demo. */
  digital: boolean;
  /** pesa no aviso de regularidade/crédito. */
  obrigatorioCredito: boolean;
}

export interface RegularidadeImovel {
  nivel: NivelRegularidade;
  haEmRisco: number;
  docsObrigatoriosFaltando: DocumentoTipo[];
  podeImpactarCredito: boolean;
  titulo: string;
  mensagem: string;
  disclaimer: string;
}

export const CATALOGO_DIGITAL: Record<DocumentoTipo, DocMeta> = {
  car:          { label: 'Recibo do CAR',        orgao: 'SICAR / Meu Imóvel Rural', digital: true,  obrigatorioCredito: true },
  'car-extrato':{ label: 'Extrato do CAR',        orgao: 'SICAR / Meu Imóvel Rural', digital: true,  obrigatorioCredito: false },
  ccir:         { label: 'CCIR',                  orgao: 'INCRA',                    digital: true,  obrigatorioCredito: true },
  sigef:        { label: 'Georreferenciamento',   orgao: 'SIGEF / INCRA',            digital: true,  obrigatorioCredito: true },
  matricula:    { label: 'Matrícula',             orgao: 'Cartório de Registro',     digital: true,  obrigatorioCredito: true },
  caf:          { label: 'CAF',                   orgao: 'MDA',                      digital: true,  obrigatorioCredito: false },
  itr:          { label: 'ITR / CAFIR',           orgao: 'Receita Federal',          digital: true,  obrigatorioCredito: false },
  licenca:      { label: 'Licença ambiental',     orgao: 'Órgão ambiental estadual', digital: true,  obrigatorioCredito: false },
  rg:           { label: 'RG / CPF',              orgao: '',                         digital: false, obrigatorioCredito: false },
  'foto-divisa':{ label: 'Foto da divisa',        orgao: '',                         digital: false, obrigatorioCredito: false },
  outro:        { label: 'Outro',                 orgao: '',                         digital: false, obrigatorioCredito: false },
};

export const OBRIGATORIOS_CREDITO: DocumentoTipo[] = (
  Object.keys(CATALOGO_DIGITAL) as DocumentoTipo[]
).filter((t) => CATALOGO_DIGITAL[t].obrigatorioCredito);

const DISCLAIMER =
  'Informação orientativa gerada a partir dos seus documentos e da geometria do ' +
  'imóvel. Não constitui oferta de crédito nem diagnóstico jurídico. A concessão ' +
  'depende de análise da instituição financeira e da documentação completa.';

/** Documentos digitais que "existem" no gov.br para este imóvel (mock determinístico). */
export function documentosDisponiveis(imovel: Imovel): Documento[] {
  const tipos: DocumentoTipo[] = [];
  if (imovel.imovel.carNumero) tipos.push('car', 'car-extrato');
  tipos.push('ccir'); // cadastro INCRA por CPF
  if (imovel.imovel.matricula) tipos.push('matricula');
  if (imovel.geometry.points.length >= 3) tipos.push('sigef'); // foi georreferenciado
  // caf/itr/licenca não são retornados por padrão → viram pendência.

  return tipos.map((tipo) => {
    const meta = CATALOGO_DIGITAL[tipo];
    return {
      id: `govbr_${tipo}`, // id estável → re-sync não duplica
      tipo,
      origem: 'govbr',
      orgao: meta.orgao,
      nome: meta.label,
      mime: 'application/pdf',
      emitidoEm: imovel.createdAt,
      createdAt: imovel.createdAt,
    } as Documento;
  });
}

/** Mescla mantendo todos os existentes; só insere `novos` cujo tipo ainda não existe. */
export function mergeDocumentos(existing: Documento[], novos: Documento[]): Documento[] {
  const tiposExistentes = new Set(existing.map((d) => d.tipo));
  return [...existing, ...novos.filter((n) => !tiposExistentes.has(n.tipo))];
}

/** Sincroniza com o gov.br (mock). Nunca lança: em falha devolve os docs atuais. */
export async function sincronizarDocumentos(imovel: Imovel): Promise<Documento[]> {
  try {
    await new Promise((r) => setTimeout(r, 600)); // simula latência da busca
    return mergeDocumentos(imovel.documentos, documentosDisponiveis(imovel));
  } catch {
    return imovel.documentos;
  }
}

/** Avalia regularidade: documentos obrigatórios faltando + hectares em risco. */
export function avaliarRegularidade(imovel: Imovel): RegularidadeImovel {
  const presentes = new Set(imovel.documentos.map((d) => d.tipo));
  const docsObrigatoriosFaltando = OBRIGATORIOS_CREDITO.filter((t) => !presentes.has(t));

  const haEmRisco = Math.abs(
    imovel.alertaDivergencia?.delta_ha ??
      imovel.deltaRelatorio?.acrescido_ha ??
      0,
  );

  const critico =
    imovel.validacao?.status === 'reprovado' ||
    imovel.alertaDivergencia?.severidade === 'critico';

  let nivel: NivelRegularidade = 'regular';
  if (critico) nivel = 'critico';
  else if (docsObrigatoriosFaltando.length > 0 || haEmRisco > 0) nivel = 'pendente';

  const podeImpactarCredito = nivel !== 'regular';

  const partes: string[] = [];
  if (haEmRisco > 0) partes.push(`~${haEmRisco.toFixed(1)} ha não regularizados`);
  if (docsObrigatoriosFaltando.length > 0) {
    const n = docsObrigatoriosFaltando.length;
    partes.push(`${n} documento${n > 1 ? 's' : ''} obrigatório${n > 1 ? 's' : ''} faltando`);
  }

  const titulo =
    nivel === 'regular' ? 'Imóvel regular' : nivel === 'critico' ? 'Regularização crítica' : 'Regularização pendente';
  const mensagem = podeImpactarCredito
    ? `${partes.join(' e ')} podem impedir o acesso a crédito rural (Pronaf/Pronampe) e financiamento bancário.`
    : 'Documentação e geometria em dia — apto a pleitear crédito rural.';

  return { nivel, haEmRisco, docsObrigatoriosFaltando, podeImpactarCredito, titulo, mensagem, disclaimer: DISCLAIMER };
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `bun src/lib/docHub.test.ts`
Expected: `docHub.test: OK`

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (atenção: `uri` agora opcional pode acusar usos em telas — corrigir guardas no consumo na Task 2; se acusar em outros arquivos, adicionar `?? ''` ou guarda mínima).

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/lib/documents.ts src/lib/docHub.ts src/lib/docHub.test.ts
git commit -m "feat(documentos): seam docHub com sync mock gov.br e avaliacao de regularidade"
```

---

### Task 2: `DocumentosScreen` — auto-sync, botão sincronizar, selo de origem, banner

**Files:**
- Modify: `src/screens/DocumentosScreen.tsx`

**Interfaces:**
- Consumes: `sincronizarDocumentos`, `avaliarRegularidade`, `RegularidadeImovel`, `CATALOGO_DIGITAL` de `../lib/docHub`; `updateImovel` de `../lib/store`.
- Produces: nada para outras tasks.

- [ ] **Step 1: Imports**

Adicionar no topo do arquivo:

```ts
import { sincronizarDocumentos, avaliarRegularidade, CATALOGO_DIGITAL } from '../lib/docHub';
import type { RegularidadeImovel } from '../lib/docHub';
```

Garantir que `updateImovel` está importado de `../lib/store` (já deve estar; se não, adicionar).

- [ ] **Step 2: Estado de sync + auto-sync no load**

Após os `useState` existentes do componente, adicionar:

```ts
const [sincronizando, setSincronizando] = useState(false);
```

Criar uma função de sync reutilizável (dentro do componente, após o `load`/`useEffect` que carrega o imóvel). Ela busca, mescla, persiste e recarrega o estado local:

```ts
const sincronizar = useCallback(async (im: Imovel) => {
  setSincronizando(true);
  try {
    const docs = await sincronizarDocumentos(im);
    const atualizado = await updateImovel(im.id, {
      documentos: docs,
      documentosSincronizadosEm: Date.now(),
    });
    if (atualizado) setImovel(atualizado);
  } finally {
    setSincronizando(false);
  }
}, []);
```

No efeito que carrega o imóvel, disparar auto-sync uma única vez quando ainda não sincronizou:

```ts
useEffect(() => {
  let vivo = true;
  getImovel(imovelId).then((im) => {
    if (!vivo || !im) return;
    setImovel(im);
    setLoading(false);
    if (!im.documentosSincronizadosEm) sincronizar(im);
  });
  return () => { vivo = false; };
}, [imovelId, sincronizar]);
```

(Adaptar ao padrão de load já existente no arquivo — manter `setLoading` como está. O ponto-chave: chamar `sincronizar(im)` só quando `!im.documentosSincronizadosEm`.)

- [ ] **Step 3: Banner de regularidade + botão sincronizar (render)**

Logo abaixo do cabeçalho/breadcrumb e acima da seção "Adicionar documentos", inserir o banner (renderizado só quando `reg.podeImpactarCredito`) e, no cabeçalho da seção de documentos, o botão de sync. Derivar `reg` no corpo do componente, após carregar o imóvel:

```tsx
const reg: RegularidadeImovel | null = imovel ? avaliarRegularidade(imovel) : null;
```

Banner:

```tsx
{reg?.podeImpactarCredito ? (
  <View style={[s.regBanner, reg.nivel === 'critico' ? s.regCritico : s.regPendente]}>
    <Text style={s.regTitulo}>{reg.titulo}</Text>
    <Text style={s.regMsg}>{reg.mensagem}</Text>
    {reg.docsObrigatoriosFaltando.length > 0 ? (
      <Text style={s.regFalta}>
        Falta: {reg.docsObrigatoriosFaltando.map((t) => CATALOGO_DIGITAL[t].label).join(', ')}
      </Text>
    ) : null}
    <Text style={s.regDisclaimer}>{reg.disclaimer}</Text>
  </View>
) : null}
```

Botão sincronizar (no cabeçalho "Adicionar documentos" / seção de gestão):

```tsx
<TouchableOpacity
  onPress={() => imovel && sincronizar(imovel)}
  disabled={sincronizando}
  style={s.syncBtn}
  accessibilityRole="button"
  accessibilityLabel="Sincronizar documentos com o gov.br"
>
  <Text style={s.syncBtnTxt}>{sincronizando ? 'Sincronizando…' : '🔄 Sincronizar com gov.br'}</Text>
</TouchableOpacity>
```

- [ ] **Step 4: Selo de origem nos itens + guarda de abertura**

No componente que renderiza cada documento da lista (`ItemDocumento` ou o map equivalente), quando `doc.origem === 'govbr'`, mostrar um selo e, ao tocar/abrir, mostrar aviso de demo em vez de abrir arquivo:

```tsx
{doc.origem === 'govbr' ? (
  <Text style={s.docOrigem}>🔗 gov.br · {doc.orgao}</Text>
) : null}
```

Onde houver ação de abrir/visualizar o documento, guardar contra `uri` vazio:

```ts
function abrirDocumento(doc: Documento) {
  if (doc.origem === 'govbr' || !doc.uri) {
    Alert.alert(doc.nome, 'Documento sincronizado do gov.br. Visualização completa disponível na versão integrada (demo).');
    return;
  }
  // ...abertura atual do arquivo local...
}
```

Se a tela usa `firstImageDoc`/preview por `uri`, filtrar para considerar só `doc.uri` definido: `imovel.documentos.find((d) => d.uri && ehImagem(d))`.

- [ ] **Step 5: Estilos**

Adicionar ao `StyleSheet.create` da tela:

```ts
regBanner: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12, gap: 4 },
regPendente: { backgroundColor: '#FFF7E6', borderColor: colors.alerta ?? '#E0A800' },
regCritico: { backgroundColor: '#FDECEC', borderColor: '#D33' },
regTitulo: { fontSize: 14, fontWeight: '800', color: colors.inkText },
regMsg: { fontSize: 13, color: colors.inkText },
regFalta: { fontSize: 12, fontWeight: '700', color: colors.mutedText },
regDisclaimer: { fontSize: 10, color: colors.mutedText, marginTop: 2 },
syncBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.verdeBg, alignSelf: 'flex-start', marginBottom: 10 },
syncBtnTxt: { fontSize: 13, fontWeight: '700', color: colors.primary },
docOrigem: { fontSize: 11, fontWeight: '700', color: colors.primary, marginTop: 2 },
```

(Se `colors.alerta` não existir, usar `'#E0A800'`. Verificar nomes reais em `src/theme/colors.ts` e ajustar.)

- [ ] **Step 6: Typecheck + verificação manual**

Run: `npx tsc --noEmit`
Expected: sem erros.

Verificação manual (descreve o que testar ao rodar o app): abrir uma propriedade no app → ver loading e a lista preencher com itens "🔗 gov.br"; banner de regularidade visível; botão "Sincronizar" não duplica itens ao tocar de novo.

- [ ] **Step 7: Commit**

```bash
git add src/screens/DocumentosScreen.tsx
git commit -m "feat(documentos): auto-sincroniza docs do gov.br e exibe aviso de regularidade no detalhe"
```

---

### Task 3: `DocumentosHubScreen` — chip de regularidade + ha em risco

**Files:**
- Modify: `src/screens/DocumentosHubScreen.tsx`

**Interfaces:**
- Consumes: `avaliarRegularidade` de `../lib/docHub`.
- Produces: nada.

- [ ] **Step 1: Import**

```ts
import { avaliarRegularidade } from '../lib/docHub';
```

- [ ] **Step 2: Substituir o chip de status por chip de regularidade**

Trocar a função `cardChip` para derivar do nível de regularidade (mantendo o componente `StatusChip` e o tipo `ChipStatus`):

```ts
function cardChip(im: Imovel): { status: ChipStatus; label: string } {
  const reg = avaliarRegularidade(im);
  if (reg.nivel === 'critico') return { status: 'critico', label: 'Crítico' };
  if (reg.nivel === 'pendente') return { status: 'aviso', label: 'Pendência' };
  return { status: 'regularizado', label: 'Regular' };
}
```

- [ ] **Step 3: Mostrar "X ha em risco" no rodapé do card**

No `renderItem`, calcular a regularidade uma vez e exibir o ha em risco no lugar/junto da área quando `> 0`:

```tsx
const reg = avaliarRegularidade(item);
// ...dentro de cardFooter, substituir o <Text style={s.area}>:
{reg.haEmRisco > 0 ? (
  <Text style={s.risco}>{reg.haEmRisco.toFixed(1)} ha em risco</Text>
) : area ? (
  <Text style={s.area}>{area}</Text>
) : null}
```

Evitar chamar `avaliarRegularidade` duas vezes: derivar `reg` no início do `renderItem` e passar para `cardChip` via `reg.nivel` inline, ou manter `cardChip(item)` e aceitar a segunda chamada (função pura barata). Escolher uma; o teste de aceite não muda.

- [ ] **Step 4: Estilo do risco**

Adicionar ao `StyleSheet.create`:

```ts
risco: { fontSize: 13, fontWeight: '800', color: '#D33' },
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/screens/DocumentosHubScreen.tsx
git commit -m "feat(documentos): chip de regularidade e ha em risco no hub de documentos"
```

---

## Self-Review

**Spec coverage:**
- Seam mock + auto-sync + botão → Task 1 (`sincronizarDocumentos`) + Task 2. ✓
- Catálogo de digitais → `CATALOGO_DIGITAL` (Task 1). ✓
- Regra de regularidade (docs + área) → `avaliarRegularidade` (Task 1). ✓
- Tipos `Documento`/`Imovel` → Task 1 Step 1. ✓
- Banner no detalhe → Task 2. ✓
- Chip + ha em risco no hub → Task 3. ✓
- Docs manuais marcados `manual` → Task 1 Step 2. ✓
- Testes da lógica pura → `docHub.test.ts` (Task 1). ✓

**Placeholder scan:** sem TBD/TODO; código completo em cada step de lógica. As partes de tela referenciam pontos de inserção reais (`ItemDocumento`, `cardChip`, `renderItem`, `firstImageDoc`) que existem nos arquivos atuais — o implementador adapta ao padrão local, mas os snippets são completos.

**Type consistency:** `sincronizarDocumentos(imovel)→Promise<Documento[]>`, `avaliarRegularidade(imovel)→RegularidadeImovel`, `documentosDisponiveis`/`mergeDocumentos` puros, `OBRIGATORIOS_CREDITO: DocumentoTipo[]`, `CATALOGO_DIGITAL` keyed por `DocumentoTipo` — nomes idênticos entre tasks. `Documento.uri` opcional consistente com as guardas da Task 2 Step 4.

## Notas de risco

- `uri` virar opcional pode acusar `tsc` em consumidores fora de Documentos (ex.: export.ts, RevisaoScreen). Se ocorrer, adicionar guarda mínima (`doc.uri ?? ''` ou pular docs sem `uri`) — não alterar comportamento de docs manuais.
- Confirmar nomes reais em `src/theme/colors.ts` (`alerta`, `verdeBg`, `primary`, `inkText`, `mutedText`) antes de usar; substituir literais se diferirem.
