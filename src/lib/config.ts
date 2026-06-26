import Constants from 'expo-constants';

// URL base da CAR Geo API (Solução 7). Configurável via app.json > extra.apiBaseUrl
// ou variável de ambiente EXPO_PUBLIC_API_BASE_URL.
const fromExtra = (Constants.expoConfig?.extra as Record<string, string> | undefined)?.apiBaseUrl;

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? fromExtra ?? 'http://localhost:3000';

// LGPD: dado de localização é sensível; fora de dev/localhost exigimos HTTPS.
if (__DEV__ && API_BASE_URL.startsWith('http:') && !API_BASE_URL.includes('localhost')) {
  console.warn('[CAR Campo] API_BASE_URL usa HTTP fora de localhost — risco LGPD. Use HTTPS em produção.');
}

// Distância mínima (m) entre pontos para registrar um novo vértice ao caminhar.
export const MIN_VERTEX_DISTANCE_M = 5;

// Precisão horizontal aceitável (m); acima disso o ponto é considerado ruim.
export const MAX_ACCEPTABLE_ACCURACY_M = 20;
