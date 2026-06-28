import Constants from 'expo-constants';

// URL base da CAR Geo API (Solução 7). Configurável via app.json > extra.apiBaseUrl
// ou variável de ambiente EXPO_PUBLIC_API_BASE_URL.
const fromExtra = (Constants.expoConfig?.extra as Record<string, string> | undefined)?.apiBaseUrl;

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? fromExtra ?? 'https://car-geo-api.onrender.com';

// Diagnóstico: confirma no console do Metro qual URL o app realmente está usando.
// Se aparecer um IP de LAN aqui, o bundle está com config velha em cache (reinicie
// o Metro com `expo start -c` e recarregue).
if (__DEV__) console.log('[CAR Campo] API_BASE_URL =', API_BASE_URL);

// LGPD: dado de localização é sensível; fora de dev exigimos HTTPS.
// localhost e IPs de rede local (LAN) são teste em device — não disparam o aviso.
const isLocalHost = /localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\./.test(API_BASE_URL);
if (__DEV__ && API_BASE_URL.startsWith('http:') && !isLocalHost) {
  console.warn('[CAR Campo] API_BASE_URL usa HTTP fora de localhost — risco LGPD. Use HTTPS em produção.');
}

// Distância mínima (m) entre pontos para registrar um novo vértice ao caminhar.
export const MIN_VERTEX_DISTANCE_M = 5;

// Precisão horizontal aceitável (m); acima disso o ponto é considerado ruim.
export const MAX_ACCEPTABLE_ACCURACY_M = 20;
