// Navegação leve baseada em estado (sem react-navigation nativo) + contexto de perfil.
// Offline-first, dev-build leve. Uma pilha simples cobre o fluxo do wizard.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Perfil } from '../types';
import { useAuth } from '../auth/AuthContext';

export type Route =
  // ── Abas v2 (4 abas por persona) ──────────────────────────────────────────
  | { name: 'dashboard' }       // produtor: aba 1 → HomeScreen
  | { name: 'medicoes' }        // ambos: aba 2 → MedicoesScreen / ValidacaoScreen
  | { name: 'documentos-hub' }  // ambos: aba 3 → DocumentosHubScreen
  | { name: 'perfil' }          // ambos: aba 4 → ConfigScreen
  // ── Abas legadas (mantidas para backward-compat de navegações internas) ───
  | { name: 'home' }
  | { name: 'validacao' }
  | { name: 'visitas' }
  | { name: 'painel' }
  | { name: 'notificacoes' }
  | { name: 'config' }
  // ── Telas de detalhe / wizard ─────────────────────────────────────────────
  | { name: 'imovel-detalhe'; imovelId: string }
  | { name: 'selecionar-imovel' }
  | { name: 'cadastro'; imovelId?: string }
  | { name: 'demarcacao'; imovelId: string }
  | { name: 'documentos'; imovelId: string }
  | { name: 'revisao'; imovelId: string }
  | { name: 'analise-ambiental'; imovelId: string }
  | { name: 'alteracao-detalhe'; imovelId: string }
  | { name: 'conferencia-lab'; imovelId?: string; car?: string }
  | { name: 'agendar-visita'; imovelId: string };

export type RouteName = Route['name'];

/** Rotas que são "abas" de topo (mostram a barra inferior, sem botão voltar). */
export const TAB_ROOTS: RouteName[] = [
  // v2 (4 abas por persona)
  'dashboard', 'medicoes', 'documentos-hub', 'perfil',
  // legadas (mantidas para navegações internas como PainelScreen → visitas)
  'home', 'validacao', 'visitas', 'painel', 'config',
];

export function isTabRoot(name: RouteName): boolean {
  return TAB_ROOTS.includes(name);
}

interface NavContext {
  route: Route;
  perfil: Perfil | null;
  ready: boolean;
  navigate: (route: Route) => void;
  replace: (route: Route) => void;
  /** Troca de aba: zera a pilha para a raiz indicada (sem voltar). */
  switchTab: (route: Route) => void;
  goBack: () => void;
  canGoBack: boolean;
}

const Ctx = createContext<NavContext | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);

  const { sessao, loading } = useAuth();
  const perfil = sessao?.perfil ?? null;
  const ready = !loading;

  // A cada novo login (token muda), volta para a aba inicial do perfil — o produtor
  // cai em "Imóveis"; o analista cai direto na "Triagem" (sem aba Imóveis).
  const prevToken = useRef<string | null>(null);
  useEffect(() => {
    const token = sessao?.token ?? null;
    if (token && token !== prevToken.current) {
      setStack([{ name: sessao?.perfil === 'analista' ? 'painel' : 'dashboard' }]);
    }
    prevToken.current = token;
  }, [sessao]);

  const navigate = useCallback((route: Route) => {
    setStack((s) => [...s, route]);
  }, []);

  const replace = useCallback((route: Route) => {
    setStack((s) => [...s.slice(0, -1), route]);
  }, []);

  const switchTab = useCallback((route: Route) => {
    setStack([route]);
  }, []);

  const goBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const value = useMemo<NavContext>(
    () => ({
      route: stack[stack.length - 1]!,
      perfil,
      ready,
      navigate,
      replace,
      switchTab,
      goBack,
      canGoBack: stack.length > 1,
    }),
    [stack, perfil, ready, navigate, replace, switchTab, goBack],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav(): NavContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNav deve ser usado dentro de NavigationProvider');
  return ctx;
}
