// Persistência offline-first dos imóveis. Tudo local (AsyncStorage); a sincronização
// com a CAR Geo API é separada (lib/api.ts). Nunca bloquear por falta de rede.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Imovel, NovoImovel, Perfil } from '../types';

const IMOVEIS_KEY = '@car-campo/imoveis';
const PERFIL_KEY = '@car-campo/perfil';

/** id simples, sem dependências nativas (evita uuid). */
function genId(): string {
  return `im_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

async function readAll(): Promise<Imovel[]> {
  try {
    const raw = await AsyncStorage.getItem(IMOVEIS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Imovel[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(list: Imovel[]): Promise<void> {
  await AsyncStorage.setItem(IMOVEIS_KEY, JSON.stringify(list));
}

export async function listImoveis(): Promise<Imovel[]> {
  const list = await readAll();
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getImovel(id: string): Promise<Imovel | null> {
  const list = await readAll();
  return list.find((i) => i.id === id) ?? null;
}

export async function createImovel(novo: NovoImovel): Promise<Imovel> {
  const now = Date.now();
  const imovel: Imovel = {
    ...novo,
    id: genId(),
    status: novo.status ?? 'rascunho',
    createdAt: now,
    updatedAt: now,
  };
  const list = await readAll();
  list.push(imovel);
  await writeAll(list);
  return imovel;
}

export async function updateImovel(
  id: string,
  patch: Partial<Omit<Imovel, 'id' | 'createdAt'>>,
): Promise<Imovel | null> {
  const list = await readAll();
  const idx = list.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const updated: Imovel = { ...list[idx]!, ...patch, id, updatedAt: Date.now() };
  list[idx] = updated;
  await writeAll(list);
  return updated;
}

/** Cria se não houver id; atualiza se houver. Conveniência para o wizard. */
export async function upsertImovel(
  id: string | null,
  data: NovoImovel,
): Promise<Imovel> {
  if (id) {
    const updated = await updateImovel(id, data);
    if (updated) return updated;
  }
  return createImovel(data);
}

export async function deleteImovel(id: string): Promise<void> {
  const list = await readAll();
  await writeAll(list.filter((i) => i.id !== id));
}

export async function getPerfil(): Promise<Perfil | null> {
  const raw = await AsyncStorage.getItem(PERFIL_KEY);
  return raw === 'produtor' || raw === 'analista' ? raw : null;
}

export async function setPerfil(perfil: Perfil): Promise<void> {
  await AsyncStorage.setItem(PERFIL_KEY, perfil);
}
