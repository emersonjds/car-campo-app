# CAR Campo — Autenticação (gov.br para produtor, matrícula para analista)

**Data:** 2026-06-26
**Desafio:** haCARthon · Desafio 2 · Solução 4

## Problema

Hoje o app abre direto na seleção de perfil (`PerfilScreen`), sem autenticação. Não há
identidade real do usuário: qualquer um escolhe "produtor" ou "analista". Para um app que
gera/envia dados de imóveis rurais (PII, LGPD), é preciso **login**:

- **Produtor rural** entra com **gov.br** (Login Único — a identidade digital oficial do cidadão).
- **Analista de campo** entra com **matrícula funcional + senha** (credencial do órgão).

O **perfil passa a ser derivado do método de login**: gov.br → produtor; matrícula → analista.
A `PerfilScreen` (escolha manual) é substituída pela `LoginScreen`.

## Decisões (com o usuário)

| Tema | Decisão |
|---|---|
| Profundidade gov.br | **Mock realista** (demo), com um **seam** (`AuthProvider`) pronto para o OIDC real |
| Login do analista | **Matrícula + senha**, validados localmente (mock, sem backend) |
| Perfil | **Derivado do login** (gov.br → produtor, matrícula → analista) |

## Como o gov.br funciona de verdade (para o mock ser fiel e a evolução ser real)

Login Único gov.br = **OpenID Connect** sobre OAuth 2.0:
- Fluxo **Authorization Code + PKCE** (RFC 7636 — `code_verifier` de 43–128 chars), **obrigatório** em apps mobile.
- App redireciona para o provedor (`https://sso.acesso.gov.br`), usuário autoriza os **scopes**
  (`openid`, `email`, `phone`, `profile`, `govbr_confiabilidades`), e recebe `code`.
- Troca `code` → `access_token` + `id_token` (JWT com nome, CPF).
- **Selos de confiabilidade** (bronze / prata / ouro) via o serviço de confiabilidades cadastrais —
  indicam o nível de segurança da conta (ex.: ouro = biometria/validação forte).
- O `client_secret` na troca do token normalmente exige um **backend** (não deve ficar no app).

Fontes: [Roteiro de Integração do Login Único](https://acesso.gov.br/roteiro-tecnico) ·
[manual servicosgovbr](https://manual-roteiro-integracao-login-unico.servicos.gov.br/pt/stable/iniciarintegracao.html).

> **Mock agora, real depois:** o app implementa um `MockAuthProvider` que reproduz visualmente o
> fluxo (botão gov.br → consentimento de scopes → retorno com nome/CPF/selo). Trocar para o real =
> implementar um `GovBrAuthProvider` com `expo-auth-session` (Authorization Code + PKCE), sem mudar
> as telas nem o resto do app.

## Arquitetura

### Modelo de sessão (`src/auth/types.ts`)
```ts
export type AuthMethod = 'govbr' | 'matricula';
export type Selo = 'bronze' | 'prata' | 'ouro';

export interface Sessao {
  perfil: Perfil;            // derivado: govbr→produtor, matricula→analista
  method: AuthMethod;
  nome: string;
  cpf?: string;              // produtor (PII)
  selo?: Selo;               // produtor (gov.br)
  matricula?: string;        // analista
  orgao?: string;            // analista
  token: string;             // mock token (futuro: access_token)
  loggedAt: number;
}
```

### Seam de autenticação (`src/auth/AuthProvider.ts`)
```ts
export interface AuthProvider {
  loginGovBr(): Promise<Sessao>;                          // mock; futuro: OIDC+PKCE
  loginMatricula(matricula: string, senha: string): Promise<Sessao>;
  logout(): Promise<void>;
  restore(): Promise<Sessao | null>;
}
```
- `src/auth/mockAuthProvider.ts` — implementação mock. `loginGovBr` resolve uma identidade demo
  (nome, CPF, selo `prata`/`ouro`). `loginMatricula` valida formato (matrícula numérica + senha
  mínima) contra uma lista mock de analistas.
- Futuro: `src/auth/govbrAuthProvider.ts` (real) implementa a MESMA interface.

### Sessão segura (`src/auth/secureSession.ts`)
- Persistência em **`expo-secure-store`** (NÃO AsyncStorage) — token e CPF são sensíveis (LGPD).
- `saveSession`, `loadSession`, `clearSession`.

### Contexto (`src/auth/AuthContext.tsx`)
- `useAuth()` → `{ sessao, loading, loginGovBr, loginMatricula, logout }`.
- No mount, `restore()` a sessão do secure-store.

### Telas
- **`src/screens/LoginScreen.tsx`** (substitui `PerfilScreen`):
  - Cabeçalho CAR Campo.
  - **Botão "Entrar com gov.br"** (azul gov.br `#1351B4`) → abre o **consentimento mock**
    (modal estilo gov.br: header "gov.br", identidade demo, scopes solicitados — nome, CPF,
    selo de confiabilidade — botão "Autorizar"). Ao autorizar → `loginGovBr()` → produtor → home.
  - Link/seção **"Sou analista — entrar com matrícula"** → formulário (matrícula + senha) →
    `loginMatricula()` → analista → home.
  - Texto LGPD curto.
- **`src/screens/ConfigScreen.tsx`** (Perfil tab) — passa a mostrar a **identidade logada**
  (nome, CPF mascarado + selo para produtor; matrícula + órgão para analista) e um botão **"Sair"**
  (logout → limpa secure-store → volta ao login). "Trocar de perfil" deixa de ser toggle manual:
  para trocar, faz logout e entra pelo outro método.

### Mudanças na navegação (`src/app/navigation.tsx` / `App.tsx`)
- O **gate** deixa de ser "tem perfil?" e passa a ser "**tem sessão?**".
- `perfil` vem da `Sessao` (via AuthContext), não mais do AsyncStorage de perfil.
- Sem sessão → `LoginScreen`. Com sessão → `home` + TabBar do perfil.
- `App.tsx` envolve tudo em `<AuthProvider>` acima do `<NavigationProvider>`.

### Pré-preenchimento no cadastro
- Para **produtor**, o `CadastroScreen` pré-preenche `produtor.nome` e `produtor.cpfCnpj` a partir
  da sessão gov.br (read-only ou editável). Para **analista**, os campos do produtor são preenchidos
  manualmente (ele cadastra em nome de terceiros).

## Segurança / LGPD
- Sessão, token e CPF em **`expo-secure-store`** (criptografado pelo OS) — nunca em AsyncStorage.
- CPF **mascarado** na UI (reusar `maskCpfCnpj`).
- **Sem log** de token/CPF/senha.
- Logout limpa completamente a sessão segura.
- PKCE/`client_secret`: documentado que o real exige backend para a troca de token.

## Novas dependências
- `expo-secure-store` (sessão segura). 
- Para o real (futuro, não agora): `expo-auth-session` + `expo-web-browser` + `expo-crypto` (PKCE).

## Arquivos
**Novos:** `src/auth/types.ts`, `src/auth/AuthProvider.ts`, `src/auth/mockAuthProvider.ts`,
`src/auth/secureSession.ts`, `src/auth/AuthContext.tsx`, `src/screens/LoginScreen.tsx`.
**Alterados:** `App.tsx`, `src/app/navigation.tsx`, `src/app/Router.tsx`, `src/screens/ConfigScreen.tsx`,
`src/screens/CadastroScreen.tsx`, `src/types.ts` (importar `Perfil` em auth/types).
**Removido/aposentado:** `src/screens/PerfilScreen.tsx` (substituída por LoginScreen).

## Critérios de sucesso
- Abrir o app sem sessão → LoginScreen.
- "Entrar com gov.br" → consentimento mock → home como **produtor**, com nome/selo na aba Perfil.
- "Entrar com matrícula" (matrícula+senha válidos) → home como **analista**.
- Sessão persiste entre reaberturas (secure-store); "Sair" volta ao login.
- Cadastro de produtor pré-preenche nome/CPF da sessão.
- CPF mascarado; nenhum log de PII; sessão sensível só em secure-store.
- `npx tsc --noEmit` limpo; bundle Metro OK; `bug` aprova.

## Fora de escopo (agora)
- OIDC real gov.br (precisa client_id/secret + backend) — só o seam fica pronto.
- Backend de validação de matrícula.
- Refresh token / expiração de sessão.
