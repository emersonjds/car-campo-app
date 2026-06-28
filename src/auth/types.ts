import type { Perfil } from '../types';

export type AuthMethod = 'govbr';
export type Selo = 'bronze' | 'prata' | 'ouro';

export interface Sessao {
  perfil: Perfil;
  method: AuthMethod;
  nome: string;
  cpf?: string;         // produtor (PII — mascarar na UI, nunca logar)
  selo?: Selo;          // produtor (gov.br)
  matricula?: string;   // analista
  orgao?: string;       // analista
  token: string;        // mock; futuro: access_token
  loggedAt: number;
}
