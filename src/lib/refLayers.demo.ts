// Fixtures offline para DEMO — camadas de referência ambiental fictícias porém
// geometricamente plausíveis, posicionadas sobre as rotas de simulação.
//
// ROTA-ALVO: SORRISO_SOJA (src/sim/routes.ts)
//   Centro aprox. -55.949°W, -12.420°S (MT — Sorriso, capital do agronegócio).
//   Vértices originais do polígono da rota:
//     [-55.9530, -12.4180]
//     [-55.9470, -12.4176]
//     [-55.9455, -12.4200]
//     [-55.9472, -12.4228]
//     [-55.9512, -12.4230]
//     [-55.9532, -12.4208]
//
// Todas as geometrias abaixo foram desenhadas para:
//   1. Fazer INTERSEÇÃO PARCIAL com o polígono SORRISO_SOJA — assim a análise
//      mostrará sobreposições reais na demo offline.
//   2. Serem menores que o imóvel (percentuais plausíveis).
//   3. Refletirem situações reais da região (TI no norte de MT, embargo
//      IBAMA típico de fiscalização de soja, alerta PRODES no entorno).
//
// IMPORTANTE: estes dados são FICTÍCIOS e existem SOMENTE para a demo.
// Não representam a situação jurídica real de nenhuma área.

import type { CamadaRef } from './overlay';
import type { LngLat } from './geo';

// ---------------------------------------------------------------------------
// 1. Terra Indígena fictícia (fragmento) — cruza parcialmente SORRISO_SOJA
//
// Posicionada na borda noroeste do polígono da fazenda (canto ~-55.953°W),
// cobrindo aproximadamente 15–20% da área do imóvel demo.
// Referência plausível: MT possui TIs Kayabi e Munduruku na região norte;
// este fragmento simula a situação de uma TI ainda em demarcação que
// avança sobre uma área agrícola, cenário comum no norte de MT.
// ---------------------------------------------------------------------------
const TI_FRAGMENTO: CamadaRef = {
  tipo: 'terra_indigena',
  nome: 'TI Xavante Sorriso (fictícia — demo)',
  fonte: 'FUNAI WFS — fixture offline',
  rings: [
    [
      // Anel externo — cruza o canto noroeste do polígono SORRISO_SOJA.
      // O polígono da TI começa fora da fazenda (lon mais a oeste) e
      // penetra até aproximadamente -55.951°W dentro dela.
      [-55.9560, -12.4160], // NO — fora da fazenda
      [-55.9490, -12.4155], // NE — dentro da fazenda (cruza)
      [-55.9488, -12.4195], // SE — dentro da fazenda
      [-55.9558, -12.4198], // SO — fora da fazenda
      [-55.9560, -12.4160], // fecha anel (= primeiro ponto)
    ],
  ],
};

// ---------------------------------------------------------------------------
// 2. Embargo IBAMA (área fictícia) — cruza o lado sul de SORRISO_SOJA
//
// Simula um auto de infração por desmatamento não autorizado, situação
// frequente em fazendas de soja que expandiram sobre vegetação nativa
// antes de 2012 (marco do Código Florestal vigente).
// Cobre aproximadamente 10% do imóvel demo.
// ---------------------------------------------------------------------------
const EMBARGO_IBAMA: CamadaRef = {
  tipo: 'embargo_ibama',
  nome: 'AI 1234567/2019 – Supressão vegetal não autorizada (demo)',
  fonte: 'IBAMA SISCOM — fixture offline',
  rings: [
    [
      // Anel cruza a borda sul do polígono SORRISO_SOJA.
      // Vértices sul da fazenda estão em latitude ~-12.422 a -12.423.
      [-55.9525, -12.4215], // NW — dentro da fazenda
      [-55.9475, -12.4218], // NE — dentro da fazenda
      [-55.9473, -12.4248], // SE — fora da fazenda (mais ao sul)
      [-55.9528, -12.4248], // SW — fora da fazenda
      [-55.9525, -12.4215], // fecha anel
    ],
  ],
};

// ---------------------------------------------------------------------------
// 3. Polígono de desmatamento PRODES (fictício) — cruza o leste de SORRISO_SOJA
//
// Simula uma feição de desmatamento detectado pelo INPE em ano recente.
// Região de MT é coberta pelo PRODES Amazônia (bioma transição).
// Cobre aproximadamente 12% do imóvel demo.
// ---------------------------------------------------------------------------
const DESMATAMENTO_PRODES: CamadaRef = {
  tipo: 'desmatamento',
  nome: 'PRODES 2023 – polígono 0047-MT (demo)',
  fonte: 'INPE TerraBrasilis PRODES — fixture offline',
  rings: [
    [
      // Anel cruza o canto leste do polígono SORRISO_SOJA.
      // Borda leste da fazenda está em lon ~-55.945 a -55.947.
      [-55.9480, -12.4178], // NW — dentro da fazenda (leste)
      [-55.9440, -12.4180], // NE — fora da fazenda (mais a leste)
      [-55.9438, -12.4220], // SE — fora da fazenda
      [-55.9478, -12.4225], // SW — dentro da fazenda
      [-55.9480, -12.4178], // fecha anel
    ],
  ],
};

// ---------------------------------------------------------------------------
// 3b. Área queimada AQ1km (cicatriz de fogo, fictícia) — cruza o sul de SORRISO_SOJA
//
// Simula uma cicatriz de queimada detectada pelo INPE (Programa Queimadas,
// produto AQ1km mensal). Cenário comum em MT no fim da estação seca, quando o
// fogo de limpeza de pasto/restos de cultura escapa para a lavoura ou vegetação.
// Posicionada no centro-sul do polígono SORRISO_SOJA, cobrindo ~5–15% do imóvel
// (interseção parcial — parte da cicatriz fica fora, ao sul da fazenda).
// ---------------------------------------------------------------------------
const QUEIMADA_AQ1KM: CamadaRef = {
  tipo: 'queimada',
  nome: 'Cicatriz de queimada AQ1km set/2023 (demo)',
  fonte: 'INPE Programa Queimadas AQ1km — fixture offline',
  rings: [
    [
      // Anel cruza a borda centro-sul da fazenda (lat fazenda ~-12.420 a -12.423).
      // Começa dentro do imóvel e estende-se para fora, ao sul.
      [-55.9515, -12.4205], // NW — dentro da fazenda
      [-55.9485, -12.4207], // NE — dentro da fazenda
      [-55.9483, -12.4238], // SE — fora da fazenda (ao sul)
      [-55.9517, -12.4238], // SW — fora da fazenda
      [-55.9515, -12.4205], // fecha anel (= primeiro ponto)
    ],
  ],
};

// ---------------------------------------------------------------------------
// 4. APP Hidrografia — riacho que passa pela borda norte (info)
//
// Simula uma faixa de APP de 30 m de um curso d'água de 1ª ordem (< 10 m)
// na borda norte da fazenda. Conforme Código Florestal (Lei 12.651/2012),
// Art. 4º, I: APP de 30 m para rios < 10 m de largura.
// Cobre ~5% do imóvel — severidade 'info'.
// ---------------------------------------------------------------------------
const APP_RIACHO: CamadaRef = {
  tipo: 'app_hidrografia',
  nome: 'APP Riacho sem nome – faixa 30 m (demo)',
  fonte: 'ANA/IBGE hidrografia — fixture offline',
  rings: [
    [
      // Faixa estreita (≈30 m de largura = ~0.00027°) ao longo da borda norte.
      [-55.9532, -12.4180], // alinha com o vértice NO da fazenda
      [-55.9455, -12.4180], // vértice NE da fazenda
      [-55.9455, -12.4183], // 30 m ao sul (interna à fazenda)
      [-55.9532, -12.4183], // volta para NO
      [-55.9532, -12.4180], // fecha anel
    ],
  ],
};

// ---------------------------------------------------------------------------
// 5. Hidrografia — riacho (linha d'água como polígono fino) cruzando SORRISO_SOJA
//
// Convenção para derivarAPP (src/lib/app.ts):
//   - nome NÃO contém 'nascente' → trata como margem de rio (faixa 30 m padrão).
//   - nome CONTÉM 'nascente'     → trata como nascente (raio 50 m).
//
// Esta feição representa um córrego de 1ª ordem (< 10 m de largura) que atravessa
// a fazenda de W para E. Representado como polígono fino (~10 m de largura).
// Após buffer de 30 m (Art. 4°, I, a, Lei 12.651/2012), produz uma faixa APP
// de ≈ 70 m de largura que cruza toda a fazenda.
// ---------------------------------------------------------------------------
const HIDRO_RIO_SORRISO: CamadaRef = {
  tipo: 'hidrografia',
  tipo_feicao: 'curso_dagua',
  nome: 'Córrego sem nome – 1ª ordem (demo)',
  fonte: 'ANA SNIRH BHO — fixture offline',
  rings: [
    [
      // Polígono fino: faixa E-W cruzando o centro-norte do polígono SORRISO_SOJA.
      // Lat ≈ -12.4200 a -12.4201 (faixa de ~11 m de largura, válida para turf).
      [-55.9550, -12.4201], // NW — fora da fazenda (a oeste)
      [-55.9440, -12.4200], // NE — fora da fazenda (a leste)
      [-55.9440, -12.4199], // SE — fora da fazenda (a leste)
      [-55.9550, -12.4200], // SW — fora da fazenda (a oeste)
      [-55.9550, -12.4201], // fecha anel
    ],
  ],
};

// ---------------------------------------------------------------------------
// 6. Hidrografia — nascente dentro de SORRISO_SOJA
//
// Representa uma nascente perene localizada no interior da fazenda.
// Após buffer de 50 m (Art. 4°, IV, Lei 12.651/2012), produz um círculo
// de APP de ≈ 0,785 ha em torno do olho d'água.
//
// Geometria: quadrado mínimo (~11 m × 11 m) centrado na nascente, válido
// como polígono turf. O centroide de rings[0] é usado por derivarAPP ao
// computar o buffer de ponto.
// ---------------------------------------------------------------------------
const HIDRO_NASCENTE_SORRISO: CamadaRef = {
  tipo: 'hidrografia',
  tipo_feicao: 'nascente',
  nome: 'Nascente – olho d\'água (demo)',
  fonte: 'ANA SNIRH BHO — fixture offline',
  rings: [
    [
      // Quadrado mínimo centrado em [-55.9500, -12.4208] — dentro do polígono.
      // halfSide ≈ 0.000050° ≈ 5,6 m
      [-55.9500500, -12.4208500], // NW
      [-55.9499500, -12.4208500], // NE
      [-55.9499500, -12.4207500], // SE
      [-55.9500500, -12.4207500], // SW
      [-55.9500500, -12.4208500], // fecha anel
    ],
  ],
};

// ---------------------------------------------------------------------------
// Exportação das fixtures
// ---------------------------------------------------------------------------

/**
 * Camadas de referência demo — geometricamente plausíveis, posicionadas
 * sobre a rota SORRISO_SOJA (src/sim/routes.ts).
 *
 * A análise de sobreposição (`analisarSobreposicoes`) com os vértices
 * dessa rota produzirá:
 *   - TI Xavante Sorriso    → 'critico' (~15–20% do imóvel)
 *   - Embargo IBAMA         → 'critico' (~10% do imóvel)
 *   - PRODES 2023           → 'alerta'  (~12% do imóvel)
 *   - Queimada AQ1km        → 'alerta'  (~5–15% do imóvel)
 *   - APP Riacho            → 'info'    (~5% do imóvel)
 *
 * Para FELIZ_NATAL_FLORESTA e OESTE_BAHIA_CERRADO não há fixtures demo;
 * a análise retornará `sobreposicoes: []` (imóveis "limpos"), o que também
 * é um cenário útil de teste.
 */
export const DEMO_CAMADAS: CamadaRef[] = [
  TI_FRAGMENTO,
  EMBARGO_IBAMA,
  DESMATAMENTO_PRODES,
  QUEIMADA_AQ1KM,
  APP_RIACHO,
];

// ---------------------------------------------------------------------------
// Perímetro anterior de demo — baseline para comparação de delta
//
// Versão LEVEMENTE MENOR da rota SORRISO_SOJA (vertices sul movidos ~0,001°
// ao norte = ≈ 111 m), para que a comparação
//   (anterior = DEMO_PERIMETRO_ANTERIOR, novo = SORRISO_SOJA vertices)
// produza:
//   • área anterior ≈ 32,7 ha  |  área nova ≈ 39,8 ha  |  Δ ≈ +7,1 ha (+21,6%)
//   • área acrescida (faixa sul): intersecta EMBARGO_IBAMA e QUEIMADA_AQ1KM
//   • severidade: CRÍTICO (acrescido toca embargo) — requerVisita = true
//
// Diferença em relação aos vértices SORRISO_SOJA:
//   V4: -12.4228 → -12.4218  (sul direito, 0,001° norte)
//   V5: -12.4230 → -12.4220  (extremo sul, 0,001° norte)
//   V6: -12.4208 → -12.4208  (inalterado — extremo SW)
//   V1–V3: inalterados (borda norte/leste)
//
// IMPORTANTE: dado FICTÍCIO, exclusivo para demonstração offline.
// ---------------------------------------------------------------------------
export const DEMO_PERIMETRO_ANTERIOR: LngLat[] = [
  { longitude: -55.9530, latitude: -12.4180 }, // V1 NW  — igual ao SORRISO_SOJA
  { longitude: -55.9470, latitude: -12.4176 }, // V2 NE  — igual ao SORRISO_SOJA
  { longitude: -55.9455, latitude: -12.4200 }, // V3 E   — igual ao SORRISO_SOJA
  { longitude: -55.9472, latitude: -12.4218 }, // V4 SE  — era -12.4228, movido +0,001° N
  { longitude: -55.9512, latitude: -12.4220 }, // V5 S   — era -12.4230, movido +0,001° N
  { longitude: -55.9532, latitude: -12.4208 }, // V6 SW  — igual ao SORRISO_SOJA
];

/**
 * Hidrografia bruta (linhas d'água e nascentes) para a demo SORRISO_SOJA.
 *
 * Uso: passar para `derivarAPP()` (src/lib/app.ts) para gerar polígonos de APP.
 * Em seguida, passar o resultado para `appDentroDoImovel()` junto com os vértices
 * do imóvel. Com os vértices de SORRISO_SOJA, o resultado será APP > 0 ha.
 *
 * Convenção de nome (src/lib/app.ts):
 *   - nome.includes('nascente') → nascente (buffer 50 m, Art. 4°, IV)
 *   - caso contrário            → margem de rio (buffer 30 m, Art. 4°, I, a)
 */
export const DEMO_HIDROGRAFIA: CamadaRef[] = [
  HIDRO_RIO_SORRISO,
  HIDRO_NASCENTE_SORRISO,
];
