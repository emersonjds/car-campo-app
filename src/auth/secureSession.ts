// Sessão sensível (token + CPF) em expo-secure-store — criptografado pelo OS (LGPD).
import * as SecureStore from 'expo-secure-store';
import type { Sessao } from './types';

const KEY = 'car-campo.sessao';

export async function saveSession(s: Sessao): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(s));
}

export async function loadSession(): Promise<Sessao | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as Sessao) : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
