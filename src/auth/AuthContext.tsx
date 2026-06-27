import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { mockAuthProvider } from './mockAuthProvider';
import type { Sessao } from './types';

const provider = mockAuthProvider; // trocar por govbrAuthProvider quando real

interface AuthValue {
  sessao: Sessao | null;
  loading: boolean;
  loginGovBr: (cpf: string) => Promise<void>;
  loginMatricula: (matricula: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProviderComponent({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    provider.restore()
      .then((s) => { if (alive) { setSessao(s); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const value = useMemo<AuthValue>(() => ({
    sessao,
    loading,
    loginGovBr: async (cpf) => { setSessao(await provider.loginGovBr(cpf)); },
    loginMatricula: async (m, s) => { setSessao(await provider.loginMatricula(m, s)); },
    logout: async () => { try { await provider.logout(); } finally { setSessao(null); } },
  }), [sessao, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProviderComponent');
  return ctx;
}
