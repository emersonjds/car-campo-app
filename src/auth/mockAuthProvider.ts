import type { AuthProvider } from './AuthProvider';
import { clearSession, loadSession, saveSession } from './secureSession';
import type { Sessao } from './types';

export const mockAuthProvider: AuthProvider = {
  async loginGovBr(cpf: string) {
    // Identidade demo retornada como se viesse do Login Único (nome, CPF, selo).
    const sessao: Sessao = {
      perfil: 'produtor',
      method: 'govbr',
      nome: 'José da Silva',
      cpf,
      selo: 'ouro',
      token: `mock-govbr-${Date.now().toString(36)}`,
      loggedAt: Date.now(),
    };
    await saveSession(sessao);
    return sessao;
  },

  async loginPersona(_perfil: 'produtor') {
    // Demo: login direto como produtor rural via gov.br. CPF fixo "tudo 1"
    // para simplificar a consulta web na demonstração.
    return mockAuthProvider.loginGovBr('11111111111');
  },

  async logout() {
    await clearSession();
  },

  async restore() {
    return loadSession();
  },
};
