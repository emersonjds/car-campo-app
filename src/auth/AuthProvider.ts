import type { Sessao } from './types';

/** Contrato de autenticação. Mock agora; GovBrAuthProvider (OIDC+PKCE) depois,
 *  com a MESMA interface — as telas não mudam. */
export interface AuthProvider {
  loginGovBr(cpf: string): Promise<Sessao>;
  /** Login direto por persona (sem credenciais) — usado na tela demo de entrada. */
  loginPersona(perfil: 'produtor'): Promise<Sessao>;
  logout(): Promise<void>;
  restore(): Promise<Sessao | null>;
}
