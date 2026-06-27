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
