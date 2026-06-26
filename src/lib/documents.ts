// Módulo de documentos: captura arquivos, copia para o sandbox do app e retorna
// um `Documento` pronto para persistir. Erros de permissão retornam null — nunca lançam.
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  documentDirectory,
  copyAsync,
  makeDirectoryAsync,
  getInfoAsync,
  deleteAsync,
} from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import type { Documento, DocumentoTipo } from '../types';

// Pasta permanente no diretório de documentos do app (persiste entre sessões).
const DOCS_DIR = `${documentDirectory}documentos/`;

// Duração máxima em ms para esperar o GPS (evita travar a câmera).
const GEOTAG_TIMEOUT_MS = 5_000;

/** Gera um id simples sem dependências externas. */
function genId(): string {
  return `doc_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Garante que a pasta `documentos/` exista no sandbox. */
async function ensureDir(): Promise<void> {
  const info = await getInfoAsync(DOCS_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(DOCS_DIR, { intermediates: true });
  }
}

/**
 * Copia `srcUri` para o sandbox do app e retorna a nova URI permanente.
 * O nome do arquivo é sanitizado para evitar caracteres problemáticos.
 */
async function copiarParaSandbox(srcUri: string, nomeOriginal: string): Promise<string> {
  await ensureDir();
  const nomeSanitizado = nomeOriginal.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const destUri = `${DOCS_DIR}${genId()}_${nomeSanitizado}`;
  await copyAsync({ from: srcUri, to: destUri });
  return destUri;
}

/**
 * Abre a galeria de fotos/imagens do dispositivo e retorna um `Documento`.
 * Retorna `null` se o usuário cancelar ou negar permissão.
 */
export async function pickFromLibrary(tipo: DocumentoTipo): Promise<Documento | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted') return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];

  const nomeOriginal = asset.fileName ?? `imagem_${Date.now()}.jpg`;
  const uri = await copiarParaSandbox(asset.uri, nomeOriginal);

  return {
    id: genId(),
    tipo,
    uri,
    nome: nomeOriginal,
    mime: asset.mimeType ?? 'image/jpeg',
    createdAt: Date.now(),
  };
}

/**
 * Abre a câmera e retorna um `Documento`.
 * Se `opts.geotag` for `true`, tenta obter a posição GPS atual (timeout em 5s).
 * Retorna `null` se o usuário cancelar ou negar permissão de câmera.
 */
export async function takePhoto(
  tipo: DocumentoTipo,
  opts?: { geotag?: boolean },
): Promise<Documento | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (perm.status !== 'granted') return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];

  const nomeOriginal = asset.fileName ?? `foto_${Date.now()}.jpg`;
  const uri = await copiarParaSandbox(asset.uri, nomeOriginal);

  let lat: number | undefined;
  let lng: number | undefined;

  if (opts?.geotag) {
    try {
      const locPerm = await Location.requestForegroundPermissionsAsync();
      if (locPerm.status === 'granted') {
        // Race entre o GPS e o timeout — geotag não bloqueia se o sinal demorar.
        const pos = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.LocationAccuracy.Balanced,
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), GEOTAG_TIMEOUT_MS)),
        ]);
        if (pos && 'coords' in pos) {
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      }
    } catch {
      // Geotag falhou por qualquer razão — foto é salva sem coordenadas.
    }
  }

  return {
    id: genId(),
    tipo,
    uri,
    nome: nomeOriginal,
    mime: asset.mimeType ?? 'image/jpeg',
    ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
    createdAt: Date.now(),
  };
}

/**
 * Abre o seletor de arquivos do sistema (PDF e imagens) e retorna um `Documento`.
 * Retorna `null` se o usuário cancelar.
 */
export async function pickDocument(tipo: DocumentoTipo): Promise<Documento | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    // copyToCacheDirectory garante leitura imediata antes de movermos para o sandbox.
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  const uri = await copiarParaSandbox(asset.uri, asset.name);

  return {
    id: genId(),
    tipo,
    uri,
    nome: asset.name,
    mime: asset.mimeType ?? 'application/octet-stream',
    createdAt: Date.now(),
  };
}

/**
 * Remove o arquivo físico do sandbox (best-effort).
 * Nunca lança — falhas são silenciosas para não travar o fluxo de remoção da lista.
 */
export async function deleteDocumentFile(doc: Documento): Promise<void> {
  try {
    const info = await getInfoAsync(doc.uri);
    if (info.exists) {
      await deleteAsync(doc.uri, { idempotent: true });
    }
  } catch {
    // best-effort: ignora erros (arquivo já removido, URI externa, etc.)
  }
}
