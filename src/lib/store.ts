// Persistência offline-first dos imóveis. Tudo local (AsyncStorage); a sincronização
// com a CAR Geo API é separada (lib/api.ts). Nunca bloquear por falta de rede.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Imovel, NovoImovel, Perfil } from '../types';
import { DEMO_IMOVEIS_SEED } from './seed.demo';

const IMOVEIS_KEY = '@car-campo/imoveis';
const PERFIL_KEY = '@car-campo/perfil';
// Versão do seed de demo. Bumpar SEED_VERSION reseta os imóveis para o conjunto
// canônico de demo no próximo load — descartando dados antigos/de teste. Como é
// um app de demonstração, o bump é uma ação deliberada de "resetar para o estado
// limpo" (ex.: passar a ter exatamente 4 sítios com geometria/CAR/técnico).
const SEED_KEY = '@car-campo/seed-version';
const SEED_VERSION = '5';

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

// Semeia os imóveis de demo na PRIMEIRA execução (store vazio). Roda uma única
// vez por instalação — se o usuário apagar tudo depois, não re-semeia. Memoizado
// para evitar corrida quando várias telas chamam listImoveis() ao montar.
let seedPromise: Promise<void> | null = null;
async function ensureSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const ver = await AsyncStorage.getItem(SEED_KEY);
    if (ver === SEED_VERSION) return;
    // Reset para o conjunto canônico de demo (descarta dados de testes antigos).
    const base = Date.now();
    const seeded: Imovel[] = DEMO_IMOVEIS_SEED.map((novo, i) => ({
      ...novo,
      id: `seed_${i}`,
      status: novo.status ?? 'rascunho',
      createdAt: base - i * 1000,
      updatedAt: base - i * 1000,
    }));
    await writeAll(seeded);
    await AsyncStorage.setItem(SEED_KEY, SEED_VERSION);
  })();
  return seedPromise;
}

export async function listImoveis(): Promise<Imovel[]> {
  await ensureSeeded();
  const list = await readAll();
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getImovel(id: string): Promise<Imovel | null> {
  await ensureSeeded();
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

  const existing = list[idx]!;

  // Snapshot automático: quando o patch inclui uma geometry diferente da atual,
  // preserva a geometry corrente em geometryAnterior antes de sobrescrever.
  // Condição: geometry existente com >= 3 pontos e diferente da nova.
  let geometryAnteriorPatch: Partial<Imovel> = {};
  if (
    patch.geometry &&
    existing.geometry &&
    existing.geometry.points.length >= 3
  ) {
    const samePoints =
      existing.geometry.points.length === patch.geometry.points.length &&
      JSON.stringify(existing.geometry.points) === JSON.stringify(patch.geometry.points);
    if (!samePoints) {
      geometryAnteriorPatch = { geometryAnterior: existing.geometry };
    }
  }

  // geometryAnteriorPatch aplicado APÓS patch para que o snapshot sempre prevaleça
  // sobre qualquer geometryAnterior passado manualmente no patch.
  const updated: Imovel = {
    ...existing,
    ...patch,
    ...geometryAnteriorPatch,
    id,
    updatedAt: Date.now(),
  };
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
