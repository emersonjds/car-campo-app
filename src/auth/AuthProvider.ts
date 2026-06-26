import type { Sessao } from './types';

/** Contrato de autenticação. Mock agora; GovBrAuthProvider (OIDC+PKCE) depois,
 *  com a MESMA interface — as telas não mudam. */
export interface AuthProvider {
  loginGovBr(): Promise<Sessao>;
  loginMatricula(matricula: string, senha: string): Promise<Sessao>;
  logout(): Promise<void>;
  restore(): Promise<Sessao | null>;
}
