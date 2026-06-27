import type { Sessao } from './types';

/** Contrato de autenticação. Mock agora; GovBrAuthProvider (OIDC+PKCE) depois,
 *  com a MESMA interface — as telas não mudam. */
export interface AuthProvider {
  loginGovBr(cpf: string): Promise<Sessao>;
  loginMatricula(matricula: string, senha: string): Promise<Sessao>;
  /** Login direto por persona (sem credenciais) — usado na tela de seleção de perfil. */
  loginPersona(perfil: 'produtor' | 'analista'): Promise<Sessao>;
  logout(): Promise<void>;
  restore(): Promise<Sessao | null>;
}
