# Login / Autenticação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar login no CAR Campo — produtor entra com gov.br (mock realista), analista com matrícula+senha (mock local), com o perfil derivado do método de login.

**Architecture:** Um `AuthProvider` (seam) com implementação mock troca-por-real depois. Sessão sensível em `expo-secure-store`. Um `AuthContext` expõe `useAuth()`. A navegação passa a "gatear" por sessão (não por perfil escolhido); `LoginScreen` substitui `PerfilScreen`. O perfil vem da sessão.

**Tech Stack:** React Native 0.85 / Expo SDK 56 / TypeScript · `expo-secure-store` · React Context.

## Global Constraints

- Expo SDK 56 — ler doc da versão exata antes de usar APIs: https://docs.expo.dev/versions/v56.0.0/
- **LGPD**: token/CPF/senha só em `expo-secure-store` (nunca AsyncStorage); CPF mascarado na UI; **sem log** de PII.
- **Offline-first**: login mock não depende de rede; restore de sessão é local.
- Verificação de cada task: `npx tsc --noEmit` SEM erros; em tasks de UI, `npx expo export --platform ios` (bundle) com exit 0; passos manuais descritos.
- Sem `Date.now()`/`Math.random()` em escopo de módulo (dentro de funções é ok).
- pt-br; alvos de toque grandes; gerenciador **bun**.
- Não quebrar contratos existentes: `Perfil` (`'produtor'|'analista'`) em `src/types.ts`; `Imovel` no store; nav `useNav()`.

---

### Task 1: Dependência + tipos de auth + sessão segura

**Files:**
- Modify: `package.json` (via `npx expo install expo-secure-store`)
- Create: `src/auth/types.ts`
- Create: `src/auth/secureSession.ts`

**Interfaces:**
- Consumes: `Perfil` de `src/types.ts`.
- Produces:
  - `AuthMethod = 'govbr' | 'matricula'`, `Selo = 'bronze' | 'prata' | 'ouro'`
  - `interface Sessao { perfil: Perfil; method: AuthMethod; nome: string; cpf?: string; selo?: Selo; matricula?: string; orgao?: string; token: string; loggedAt: number }`
  - `saveSession(s: Sessao): Promise<void>`, `loadSession(): Promise<Sessao | null>`, `clearSession(): Promise<void>`

- [ ] **Step 1: Instalar a dependência**

Run: `npx expo install expo-secure-store`
Expected: instala `expo-secure-store@~56.x` e atualiza `package.json`/`bun.lockb`.

- [ ] **Step 2: Criar `src/auth/types.ts`**

```ts
import type { Perfil } from '../types';

export type AuthMethod = 'govbr' | 'matricula';
export type Selo = 'bronze' | 'prata' | 'ouro';

export interface Sessao {
  perfil: Perfil;       // derivado do método: govbr→produtor, matricula→analista
  method: AuthMethod;
  nome: string;
  cpf?: string;         // produtor (PII — mascarar na UI, nunca logar)
  selo?: Selo;          // produtor (gov.br)
  matricula?: string;   // analista
  orgao?: string;       // analista
  token: string;        // mock; futuro: access_token
  loggedAt: number;
}
```

- [ ] **Step 3: Criar `src/auth/secureSession.ts`**

```ts
// Sessão sensível (token + CPF) em expo-secure-store — criptografado pelo OS (LGPD).
import * as SecureStore from 'expo-secure-store';
import type { Sessao } from './types';

const KEY = 'car-campo.sessao';

export async function saveSession(s: Sessao): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(s));
}

export async function loadSession(): Promise<Sessao | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as Sessao) : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors found.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lockb src/auth/types.ts src/auth/secureSession.ts
git commit -m "feat(auth): tipos de sessão + persistência em secure-store"
```

---

### Task 2: AuthProvider (seam) + implementação mock

**Files:**
- Create: `src/auth/AuthProvider.ts`
- Create: `src/auth/mockAuthProvider.ts`

**Interfaces:**
- Consumes: `Sessao`, `Selo` de `./types`; `saveSession`, `loadSession`, `clearSession` de `./secureSession`.
- Produces:
  - `interface AuthProvider { loginGovBr(): Promise<Sessao>; loginMatricula(matricula: string, senha: string): Promise<Sessao>; logout(): Promise<void>; restore(): Promise<Sessao | null> }`
  - `mockAuthProvider: AuthProvider`
  - `validarMatricula(matricula: string, senha: string): { ok: boolean; erro?: string; nome?: string; orgao?: string }` (exportada para checagem)

- [ ] **Step 1: Criar `src/auth/AuthProvider.ts`**

```ts
import type { Sessao } from './types';

/** Contrato de autenticação. Mock agora; GovBrAuthProvider (OIDC+PKCE) depois,
 *  com a MESMA interface — as telas não mudam. */
export interface AuthProvider {
  loginGovBr(): Promise<Sessao>;
  loginMatricula(matricula: string, senha: string): Promise<Sessao>;
  logout(): Promise<void>;
  restore(): Promise<Sessao | null>;
}
```

- [ ] **Step 2: Criar `src/auth/mockAuthProvider.ts`**

```ts
// Implementação MOCK do AuthProvider para a demo do hackathon.
// gov.br: resolve uma identidade demo com selo de confiabilidade.
// matrícula: valida formato + lista mock de analistas.
import type { AuthProvider } from './AuthProvider';
import type { Sessao } from './types';
import { clearSession, loadSession, saveSession } from './secureSession';

// Analistas de demonstração (mock — substituir por backend no futuro).
const ANALISTAS: Record<string, { senha: string; nome: string; orgao: string }> = {
  '12345': { senha: 'car2026', nome: 'Ana Lima (Analista)', orgao: 'SEMA-MT' },
  '54321': { senha: 'car2026', nome: 'Bruno Souza (Analista)', orgao: 'INCRA' },
};

export function validarMatricula(
  matricula: string,
  senha: string,
): { ok: boolean; erro?: string; nome?: string; orgao?: string } {
  const m = matricula.trim();
  if (!/^\d{3,}$/.test(m)) return { ok: false, erro: 'Matrícula inválida (só números).' };
  const rec = ANALISTAS[m];
  if (!rec || rec.senha !== senha) return { ok: false, erro: 'Matrícula ou senha incorretos.' };
  return { ok: true, nome: rec.nome, orgao: rec.orgao };
}

export const mockAuthProvider: AuthProvider = {
  async loginGovBr() {
    // Identidade demo retornada como se viesse do Login Único (nome, CPF, selo).
    const sessao: Sessao = {
      perfil: 'produtor',
      method: 'govbr',
      nome: 'José da Silva',
      cpf: '12345678909',
      selo: 'ouro',
      token: `mock-govbr-${Date.now().toString(36)}`,
      loggedAt: Date.now(),
    };
    await saveSession(sessao);
    return sessao;
  },

  async loginMatricula(matricula: string, senha: string) {
    const r = validarMatricula(matricula, senha);
    if (!r.ok) throw new Error(r.erro ?? 'Falha no login.');
    const sessao: Sessao = {
      perfil: 'analista',
      method: 'matricula',
      nome: r.nome!,
      matricula: matricula.trim(),
      orgao: r.orgao,
      token: `mock-matricula-${Date.now().toString(36)}`,
      loggedAt: Date.now(),
    };
    await saveSession(sessao);
    return sessao;
  },

  async logout() {
    await clearSession();
  },

  async restore() {
    return loadSession();
  },
};
```

- [ ] **Step 3: Verificação de lógica pura (assert manual via node)**

Run:
```bash
node -e "const t=require('@babel/core');" 2>/dev/null; \
npx tsc --noEmit && echo "tsc ok"
```
Expected: `tsc ok`. (Sem runner de teste no projeto; a lógica de `validarMatricula` é validada manualmente no app na Task 4.)

- [ ] **Step 4: Commit**

```bash
git add src/auth/AuthProvider.ts src/auth/mockAuthProvider.ts
git commit -m "feat(auth): AuthProvider seam + mock (gov.br + matrícula)"
```

---

### Task 3: AuthContext

**Files:**
- Create: `src/auth/AuthContext.tsx`

**Interfaces:**
- Consumes: `mockAuthProvider`, `Sessao`.
- Produces:
  - `<AuthProviderComponent>{children}</AuthProviderComponent>`
  - `useAuth(): { sessao: Sessao | null; loading: boolean; loginGovBr: () => Promise<void>; loginMatricula: (m: string, s: string) => Promise<void>; logout: () => Promise<void> }`

- [ ] **Step 1: Criar `src/auth/AuthContext.tsx`**

```tsx
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { mockAuthProvider } from './mockAuthProvider';
import type { Sessao } from './types';

const provider = mockAuthProvider; // trocar por govbrAuthProvider quando real

interface AuthValue {
  sessao: Sessao | null;
  loading: boolean;
  loginGovBr: () => Promise<void>;
  loginMatricula: (matricula: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProviderComponent({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    provider.restore().then((s) => {
      if (alive) { setSessao(s); setLoading(false); }
    });
    return () => { alive = false; };
  }, []);

  const value = useMemo<AuthValue>(() => ({
    sessao,
    loading,
    loginGovBr: async () => { setSessao(await provider.loginGovBr()); },
    loginMatricula: async (m, s) => { setSessao(await provider.loginMatricula(m, s)); },
    logout: async () => { await provider.logout(); setSessao(null); },
  }), [sessao, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProviderComponent');
  return ctx;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors found.

- [ ] **Step 3: Commit**

```bash
git add src/auth/AuthContext.tsx
git commit -m "feat(auth): AuthContext com restore/login/logout"
```

---

### Task 4: LoginScreen (gov.br mock + matrícula)

**Files:**
- Create: `src/screens/LoginScreen.tsx`

**Interfaces:**
- Consumes: `useAuth()` (loginGovBr, loginMatricula); `Screen` de `src/app/Screen.tsx`; `Card`, `Field`, `PrimaryButton`, `SecondaryButton` de `src/ui`; `colors`.
- Produces: `LoginScreen` (sem props).

- [ ] **Step 1: Criar `src/screens/LoginScreen.tsx`**

```tsx
import { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../app/Screen';
import { useAuth } from '../auth/AuthContext';
import { Card, Field, PrimaryButton, SecondaryButton } from '../ui';
import { colors } from '../theme/colors';

const GOVBR_BLUE = '#1351B4';

export function LoginScreen() {
  const { loginGovBr, loginMatricula } = useAuth();
  const [consent, setConsent] = useState(false);
  const [analista, setAnalista] = useState(false);
  const [matricula, setMatricula] = useState('');
  const [senha, setSenha] = useState('');
  const [busy, setBusy] = useState(false);

  async function autorizarGovBr() {
    setBusy(true);
    try { await loginGovBr(); } finally { setBusy(false); setConsent(false); }
  }

  async function entrarMatricula() {
    setBusy(true);
    try { await loginMatricula(matricula, senha); }
    catch (e) { Alert.alert('Login', e instanceof Error ? e.message : 'Falha no login.'); }
    finally { setBusy(false); }
  }

  return (
    <Screen title="CAR Campo" subtitle="Entre para demarcar seu imóvel" showBack={false}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.intro}>Produtor rural? Entre com sua conta gov.br.</Text>
        <TouchableOpacity style={[s.govbr, busy && { opacity: 0.6 }]} onPress={() => setConsent(true)} disabled={busy} activeOpacity={0.85}>
          <Text style={s.govbrText}>Entrar com <Text style={s.govbrBold}>gov.br</Text></Text>
        </TouchableOpacity>

        <View style={s.sep}><Text style={s.sepText}>ou</Text></View>

        {!analista ? (
          <SecondaryButton label="Sou analista — entrar com matrícula" onPress={() => setAnalista(true)} />
        ) : (
          <Card>
            <Field label="Matrícula" value={matricula} onChangeText={setMatricula} placeholder="Ex: 12345" keyboardType="numeric" />
            <Field label="Senha" value={senha} onChangeText={setSenha} placeholder="Sua senha" />
            <PrimaryButton label="Entrar" onPress={entrarMatricula} loading={busy} />
            <Text style={s.demo}>Demo: matrícula 12345 · senha car2026</Text>
          </Card>
        )}

        <Text style={s.lgpd}>🔒 Seus dados ficam protegidos neste aparelho (LGPD).</Text>
      </ScrollView>

      {/* Consentimento estilo gov.br (mock do fluxo OIDC) */}
      <Modal visible={consent} transparent animationType="slide" onRequestClose={() => setConsent(false)}>
        <View style={s.modalWrap}>
          <View style={s.modalCard}>
            <Text style={s.modalGov}><Text style={{ color: GOVBR_BLUE }}>gov</Text>.br</Text>
            <Text style={s.modalTitle}>CAR Campo quer acessar:</Text>
            {['Nome completo', 'CPF', 'Selo de confiabilidade'].map((scope) => (
              <Text key={scope} style={s.scope}>• {scope}</Text>
            ))}
            <Text style={s.modalHint}>Você entrará como produtor rural.</Text>
            <PrimaryButton label="Autorizar" onPress={autorizarGovBr} loading={busy} />
            <View style={{ height: 8 }} />
            <SecondaryButton label="Cancelar" onPress={() => setConsent(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { padding: 16 },
  intro: { fontSize: 14, color: colors.muted, marginBottom: 12, lineHeight: 20 },
  govbr: { backgroundColor: GOVBR_BLUE, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  govbrText: { color: colors.branco, fontSize: 17, fontWeight: '700' },
  govbrBold: { fontWeight: '900' },
  sep: { alignItems: 'center', marginVertical: 18 },
  sepText: { color: colors.muted, fontSize: 13 },
  demo: { fontSize: 12, color: colors.muted, marginTop: 10, textAlign: 'center' },
  lgpd: { fontSize: 12, color: colors.muted, marginTop: 24, textAlign: 'center', lineHeight: 18 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.branco, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 22 },
  modalGov: { fontSize: 26, fontWeight: '900', color: colors.ink, marginBottom: 14 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  scope: { fontSize: 14, color: colors.muted, marginVertical: 3 },
  modalHint: { fontSize: 13, color: colors.muted, marginTop: 12, marginBottom: 16 },
});
```

- [ ] **Step 2: Typecheck + bundle**

Run: `npx tsc --noEmit && rm -rf /tmp/cc-auth && npx expo export --platform ios --output-dir /tmp/cc-auth`
Expected: tsc sem erros; bundle exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/screens/LoginScreen.tsx
git commit -m "feat(auth): LoginScreen (gov.br mock + matrícula)"
```

---

### Task 5: Gatear navegação por sessão (substitui PerfilScreen)

**Files:**
- Modify: `App.tsx`
- Modify: `src/app/navigation.tsx`
- Modify: `src/app/Router.tsx`
- Modify: `src/app/AppShell.tsx`
- Delete: `src/screens/PerfilScreen.tsx`

**Interfaces:**
- Consumes: `useAuth()` (sessao, loading); `AuthProviderComponent`.
- Produces: navegação que mostra `LoginScreen` quando `sessao == null`; `perfil` derivado de `sessao.perfil`.

- [ ] **Step 1: Envolver o app com AuthProvider (`App.tsx`)**

```tsx
import { AuthProviderComponent } from './src/auth/AuthContext';
import { NavigationProvider } from './src/app/navigation';
import { AppShell } from './src/app/AppShell';

export default function App() {
  return (
    <AuthProviderComponent>
      <NavigationProvider>
        <AppShell />
      </NavigationProvider>
    </AuthProviderComponent>
  );
}
```

- [ ] **Step 2: `navigation.tsx` — derivar perfil/ready da sessão**

Em `NavigationProvider`, substituir o uso de `getPerfil()` por `useAuth()`:
- importar `useAuth` de `../auth/AuthContext`;
- `const { sessao, loading } = useAuth();`
- `perfil = sessao?.perfil ?? null`;
- `ready = !loading`;
- remover o `useEffect` que lia `getPerfil` e o estado `perfil`/`setPerfilState`; remover `chooseProfile` (não há mais escolha manual) **ou** mantê-lo como no-op até a Task 6 ajustar ConfigScreen — para evitar quebra, **manter `chooseProfile` temporariamente removido das telas na mesma task** (ver Step 4).
- A pilha inicial não precisa mais da rota `perfil`: iniciar sempre em `[{ name: 'home' }]` (o gate de login é feito no Router/AppShell).

```tsx
// trecho relevante
import { useAuth } from '../auth/AuthContext';
// ...
const { sessao, loading } = useAuth();
const perfil = sessao?.perfil ?? null;
const ready = !loading;
const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
```
Remover `chooseProfile` do tipo `NavContext` e do `value`. Remover import de `getPerfil`/`setPerfil`. Remover a rota `'perfil'` do tipo `Route` e de `TAB_ROOTS` (já não está em TAB_ROOTS).

- [ ] **Step 3: `Router.tsx` — gate de login + remover rota perfil**

```tsx
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
// remover import de PerfilScreen
// dentro de Router():
const { sessao, loading } = useAuth();
if (loading) { /* manter o ActivityIndicator atual */ }
if (!sessao) return <LoginScreen />;
// remover o case 'perfil'
```

- [ ] **Step 4: `AppShell.tsx` — esconder TabBar sem sessão**

```tsx
const { route, perfil, ready } = useNav();
const showTabBar = ready && !!perfil && isTabRoot(route.name);
```
(perfil agora vem da sessão; quando sem sessão, perfil é null → sem TabBar. Sem mudança de código além de garantir que continua válido.)

- [ ] **Step 5: Remover `PerfilScreen.tsx`**

```bash
git rm src/screens/PerfilScreen.tsx
```

- [ ] **Step 6: Typecheck + bundle**

Run: `npx tsc --noEmit && rm -rf /tmp/cc-auth2 && npx expo export --platform ios --output-dir /tmp/cc-auth2`
Expected: tsc sem erros; bundle exit 0. Corrigir referências quebradas a `chooseProfile`/`'perfil'`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth): navegação gateia por sessão; LoginScreen substitui PerfilScreen"
```

---

### Task 6: ConfigScreen — identidade logada + Sair

**Files:**
- Modify: `src/screens/ConfigScreen.tsx`

**Interfaces:**
- Consumes: `useAuth()` (sessao, logout); `maskCpfCnpj` (reusar — extrair util ou duplicar como em RevisaoScreen).
- Produces: ConfigScreen mostra nome/CPF mascarado/selo (produtor) ou matrícula/órgão (analista) + botão "Sair".

- [ ] **Step 1: Reescrever `ConfigScreen.tsx`**

Substituir o conteúdo "trocar de perfil" por identidade + logout:
```tsx
import { useAuth } from '../auth/AuthContext';
// ...
const { sessao, logout } = useAuth();
// Card "Identidade":
//   produtor: nome, CPF mascarado (mesma maskCpfCnpj da RevisaoScreen), selo (Badge)
//   analista: nome, matrícula, órgão
// Card "Conta": SecondaryButton "Sair" -> Alert confirm -> logout()
// Manter a nota LGPD.
```
Detalhe do mascaramento (copiar de `RevisaoScreen.tsx`):
```ts
function maskCpf(v: string) {
  const d = v.replace(/\D/g, '');
  return d.length === 11 ? `***.${d.slice(3,6)}.${d.slice(6,9)}-**` : '***';
}
```
Botão Sair:
```tsx
<SecondaryButton label="Sair" onPress={() =>
  Alert.alert('Sair', 'Encerrar a sessão neste aparelho?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Sair', style: 'destructive', onPress: () => logout() },
  ])
} />
```
Remover `chooseProfile`/troca manual de perfil.

- [ ] **Step 2: Typecheck + bundle**

Run: `npx tsc --noEmit && rm -rf /tmp/cc-auth3 && npx expo export --platform ios --output-dir /tmp/cc-auth3`
Expected: tsc sem erros; bundle exit 0.

- [ ] **Step 3: Verificação manual**

Descrever: abrir app → login gov.br → aba Perfil mostra "José da Silva", CPF `***.456.789-**`, selo "ouro" → Sair → volta ao LoginScreen. Login matrícula 12345/car2026 → Perfil mostra matrícula/órgão.

- [ ] **Step 4: Commit**

```bash
git add src/screens/ConfigScreen.tsx
git commit -m "feat(auth): ConfigScreen mostra identidade logada + Sair"
```

---

### Task 7: Pré-preencher cadastro com a sessão do produtor

**Files:**
- Modify: `src/screens/CadastroScreen.tsx`

**Interfaces:**
- Consumes: `useAuth()` (sessao).
- Produces: ao criar imóvel novo (sem imovelId) como produtor, `produtorNome`/`cpfCnpj` iniciam preenchidos da sessão.

- [ ] **Step 1: Pré-preencher estado inicial**

No `CadastroScreen`, quando `!imovelId` e `sessao?.method === 'govbr'`:
```tsx
const { sessao } = useAuth();
// nos useState iniciais, ou num useEffect quando !imovelId:
useEffect(() => {
  if (!imovelId && sessao?.method === 'govbr') {
    setProdutorNome((v) => v || sessao.nome);
    setCpfCnpj((v) => v || (sessao.cpf ?? ''));
  }
}, [imovelId, sessao]);
```
(Analista preenche manualmente — nada muda para ele.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors found.

- [ ] **Step 3: Commit**

```bash
git add src/screens/CadastroScreen.tsx
git commit -m "feat(auth): cadastro de produtor pré-preenche nome/CPF da sessão"
```

---

### Task 8: Quality gate + app.json (permissão/descrição) + ajuste de docs

**Files:**
- Modify: `app.json` (se necessário — secure-store não exige permissão extra)
- Modify: `CLAUDE.md` / `README.md` (mencionar login)
- Review: todo o módulo `src/auth/*` e telas tocadas

- [ ] **Step 1: Rodar o quality gate `bug`**

Dispatch agent `bug` para revisar `src/auth/*`, `LoginScreen`, `ConfigScreen`, `navigation.tsx`: foco em LGPD (token/CPF só em secure-store, sem log), ausência de vazamento, tratamento de erro de login, restore de sessão, e que logout limpa tudo.

- [ ] **Step 2: Corrigir achados do `bug`**

(Sem código fixo — depende dos achados; aplicar correções e re-typecheck/bundle.)

- [ ] **Step 3: Atualizar docs**

Adicionar em `CLAUDE.md` (seção Arquitetura) e `README.md` (Features): login gov.br (produtor, mock) / matrícula (analista); sessão em secure-store; perfil derivado do login.

- [ ] **Step 4: Typecheck + bundle final**

Run: `npx tsc --noEmit && rm -rf /tmp/cc-auth4 && npx expo export --platform ios --output-dir /tmp/cc-auth4`
Expected: tsc sem erros; bundle exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(auth): quality gate + docs do fluxo de login"
```

---

## Self-Review

**Spec coverage:**
- gov.br mock + seam → Tasks 2, 3, 4 ✓
- matrícula+senha mock → Tasks 2, 4 ✓
- perfil derivado do login → Task 5 ✓
- sessão em secure-store → Task 1 ✓
- LoginScreen substitui PerfilScreen → Tasks 4, 5 ✓
- ConfigScreen identidade + logout → Task 6 ✓
- pré-preenchimento cadastro → Task 7 ✓
- LGPD (mascarar/secure-store/sem log) → Tasks 1, 6, 8 ✓
- quality gate + docs → Task 8 ✓

**Placeholder scan:** Task 6 e Task 8 descrevem mudanças sem bloco de código completo em alguns pontos (ConfigScreen é uma reescrita guiada; correções do `bug` são condicionais). Aceitável: ConfigScreen tem os trechos-chave (mask, logout) e Task 8 é revisão/correção por natureza. Demais tasks têm código completo.

**Type consistency:** `Sessao`, `AuthMethod`, `Selo` definidos na Task 1 e usados consistentemente; `useAuth()` com a mesma assinatura nas Tasks 3–7; `validarMatricula` definida e usada na Task 2/4.

## Execution Handoff

Plano salvo em `docs/superpowers/plans/2026-06-26-login-auth.md`.
