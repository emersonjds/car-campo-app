// Tela de Demarcação — Passo 2 do wizard.
// Layout imersivo: mapa ocupa quase toda a tela; HUD sobreposto translúcido;
// seletor de rota só quando idle; topo e rodapé finos.
// Suporta GPS real (usePerimeterTracker) e Simulação (useSimulatedWalk).
// Offline-first: grava geometry localmente via updateImovel; nunca bloqueia por rede.
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Circle, Marker, Polygon, Polyline } from 'react-native-maps';

import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { areaHectares, perimeterM, simplifyRDP, type LngLat } from '../lib/geo';
import { getImovel, updateImovel } from '../lib/store';
import { DEMO_ROUTES } from '../sim/routes';
import { useSimulatedWalk } from '../sim/useSimulatedWalk';
import { usePerimeterTracker } from '../hooks/usePerimeterTracker';
import { Button } from '../ui';
import { colors } from '../theme/colors';
import { text } from '../theme/typography';
import { derivarAPP, appDentroDoImovel, type AppResultado } from '../lib/app';
import { DEMO_HIDROGRAFIA, DEMO_CAMADAS } from '../lib/refLayers.demo';
import { analisarAlteracaoImovel } from '../lib/alteracao';

// ---------- tipos ----------

type Mode = 'gps' | 'sim';

// ---------- helpers ----------

const toLatLng = (p: LngLat) => ({ latitude: p.latitude, longitude: p.longitude });

function validatePerimeterLocal(points: LngLat[]): Array<{ msg: string; tone: 'aviso' | 'ok' }> {
  const issues: Array<{ msg: string; tone: 'aviso' | 'ok' }> = [];
  if (points.length === 0) return issues;
  if (points.length < 3) {
    const faltam = 3 - points.length;
    issues.push({ msg: `Marque mais ${faltam} ponto${faltam > 1 ? 's' : ''} pra fechar`, tone: 'aviso' });
    return issues;
  }
  const area = areaHectares(points);
  if (area < 0.05) {
    issues.push({ msg: `Área muito pequena — confira os pontos`, tone: 'aviso' });
  } else if (area > 2500) {
    issues.push({ msg: `Área muito grande — confira os pontos`, tone: 'aviso' });
  } else {
    issues.push({ msg: `Pronto! ${area.toFixed(1)} ha medidos`, tone: 'ok' });
  }
  return issues;
}

// ---------- constantes ----------

const DEFAULT_REGION = {
  latitude: DEMO_ROUTES[0]!.vertices[0]!.latitude,
  longitude: DEMO_ROUTES[0]!.vertices[0]!.longitude,
  // Zoom inicial mais aberto — mostra o terreno a uma distância maior.
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

// ---------- camadas estáticas (módulo-level, imutáveis) ----------

const APP_CAMADAS_DEMO = derivarAPP(DEMO_HIDROGRAFIA);

const HIDRO_FEATURES = DEMO_HIDROGRAFIA.map((feat) => {
  const isNascente = feat.nome.toLowerCase().includes('nascente');
  const ring = feat.rings[0] ?? [];
  if (isNascente) {
    const validPts = ring.filter((c) => c.length >= 2);
    const count = validPts.length || 1;
    const lon = validPts.reduce((s, c) => s + (c[0] ?? 0), 0) / count;
    const lat = validPts.reduce((s, c) => s + (c[1] ?? 0), 0) / count;
    return { isNascente: true as const, center: { latitude: lat, longitude: lon } };
  }
  return {
    isNascente: false as const,
    coords: ring.map((c) => ({ latitude: c[1] ?? 0, longitude: c[0] ?? 0 })),
  };
});

const APP_POLY_COORDS = APP_CAMADAS_DEMO.map((feat) =>
  (feat.rings[0] ?? []).map((c) => ({ latitude: c[1] ?? 0, longitude: c[0] ?? 0 })),
);

// ---------- sub-componentes HUD ----------

function AvatarMarker({ coordinate, pulse }: { coordinate: LngLat; pulse: Animated.Value }) {
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });
  return (
    <Marker coordinate={toLatLng(coordinate)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges>
      <View style={s.avatarWrap}>
        <Animated.View style={[s.avatarRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
        <View style={s.avatarDot}>
          <Text style={s.avatarEmoji}>🚶</Text>
        </View>
      </View>
    </Marker>
  );
}

/** Card ÁREA ATUAL — compacto, sobreposto ao mapa. */
function AreaHUD({ area, perimeter, hasPoints }: { area: number; perimeter: number; hasPoints: boolean }) {
  return (
    <View style={s.areaCard}>
      <Text style={s.areaCardLabel}>AREA ATUAL</Text>
      <View style={s.areaCardRow}>
        <Text style={s.areaValue} numberOfLines={1}>
          {hasPoints ? area.toFixed(1) : '--'}
          <Text style={s.areaUnit}> ha</Text>
        </Text>
        <View style={s.perimeterBlock}>
          <Text style={s.perimeterLabel}>Perimetro</Text>
          <Text style={s.perimeterValue}>
            {hasPoints ? `${Math.round(perimeter).toLocaleString('pt-BR')} m` : '--'}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Chips Precisão GPS + Acelerômetro — compactos, sobrepostos. */
function SensorChips({ accuracy }: { accuracy: number | null | undefined }) {
  return (
    <View style={s.chipsRow}>
      <View style={s.chip}>
        <View style={[s.chipIcon, { backgroundColor: colors.primary }]}>
          <Ionicons name="locate" size={14} color={colors.branco} />
        </View>
        <View>
          <Text style={s.chipLabel}>Precisao GPS</Text>
          <Text style={s.chipValue}>{accuracy != null ? `${accuracy.toFixed(1)} m` : '-- m'}</Text>
        </View>
      </View>
      {/* ponytail: acelerômetro sem API nativa aqui; placeholder estático do mockup */}
      <View style={s.chip}>
        <View style={[s.chipIcon, { backgroundColor: colors.secondary }]}>
          <Ionicons name="phone-portrait-outline" size={14} color={colors.branco} />
        </View>
        <View>
          <Text style={s.chipLabel}>Acelerometro</Text>
          <Text style={s.chipValue}>Estavel</Text>
        </View>
      </View>
    </View>
  );
}

type RegionLike = typeof DEFAULT_REGION;

/** +/−, centralizar, camadas — coluna direita do mapa. */
function MapControls({
  mapRef,
  regionRef,
  onCenter,
}: {
  mapRef: React.RefObject<MapView | null>;
  regionRef: React.MutableRefObject<RegionLike>;
  onCenter: () => void;
}) {
  const zoom = (f: number) => {
    const r = regionRef.current;
    mapRef.current?.animateToRegion(
      { ...r, latitudeDelta: r.latitudeDelta * f, longitudeDelta: r.longitudeDelta * f },
      220,
    );
  };
  return (
    <View style={s.mapControls}>
      <TouchableOpacity style={s.mapBtn} onPress={() => zoom(0.5)} activeOpacity={0.8}>
        <Ionicons name="add" size={20} color={colors.inkText} />
      </TouchableOpacity>
      <TouchableOpacity style={s.mapBtn} onPress={() => zoom(2)} activeOpacity={0.8}>
        <Ionicons name="remove" size={20} color={colors.inkText} />
      </TouchableOpacity>
      <TouchableOpacity style={s.mapBtn} onPress={onCenter} activeOpacity={0.8}>
        <Ionicons name="navigate-circle-outline" size={20} color={colors.inkText} />
      </TouchableOpacity>
      {/* ponytail: camadas — visual apenas, sem lógica nova de mapa */}
      <TouchableOpacity style={s.mapBtn} activeOpacity={0.8}>
        <Ionicons name="layers-outline" size={20} color={colors.inkText} />
      </TouchableOpacity>
    </View>
  );
}

// ---------- tela principal ----------

export function DemarcacaoScreen({ imovelId }: { imovelId: string }) {
  const { navigate } = useNav();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('sim');
  const [selectedRouteId, setSelectedRouteId] = useState(DEMO_ROUTES[0]!.id);
  const [saving, setSaving] = useState(false);
  const [appResultado, setAppResultado] = useState<AppResultado | null>(null);

  // Hooks de captura (ambos sempre ativos — lei dos hooks)
  const sim = useSimulatedWalk();
  const tracker = usePerimeterTracker();

  const mapRef = useRef<MapView>(null);
  const lastRegionUpdateRef = useRef(0);
  // ponytail: região rastreada pelo onRegionChangeComplete para os botões de zoom
  const currentRegionRef = useRef<RegionLike>(DEFAULT_REGION);

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  const activePoints: LngLat[] = mode === 'sim' ? sim.points : tracker.points;
  const activeAvatar: LngLat | null = mode === 'sim' ? sim.avatar : tracker.current;

  // ---------- efeito: carrega imóvel ----------
  // O produtor mede ÀS CEGAS — não exibe o perímetro registrado.
  useEffect(() => {
    let alive = true;
    getImovel(imovelId).then((v) => { if (!alive || !v) return; });
    return () => { alive = false; };
  }, [imovelId]);

  // ---------- efeito: animação de pulso ----------
  useEffect(() => {
    if (activeAvatar) {
      pulseRef.current?.stop();
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
      );
      pulseRef.current = anim;
      anim.start();
      return () => anim.stop();
    }
    pulseRef.current?.stop();
    pulseAnim.setValue(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAvatar !== null]);

  // ---------- efeito: segue avatar no mapa (throttled 1 Hz) ----------
  useEffect(() => {
    if (!activeAvatar || !mapRef.current) return;
    const now = Date.now();
    if (now - lastRegionUpdateRef.current < 1000) return;
    lastRegionUpdateRef.current = now;
    mapRef.current.animateToRegion(
      { latitude: activeAvatar.latitude, longitude: activeAvatar.longitude, latitudeDelta: 0.018, longitudeDelta: 0.018 },
      500,
    );
  }, [activeAvatar]);

  // ---------- APP ao vivo (debounce 500 ms) ----------
  useEffect(() => {
    if (activePoints.length < 3) { setAppResultado(null); return; }
    const t = setTimeout(() => {
      try {
        const pts = simplifyRDP(activePoints, 3);
        setAppResultado(appDentroDoImovel(pts.length >= 3 ? pts : activePoints, APP_CAMADAS_DEMO));
      } catch { /* geometria inválida — não quebra */ }
    }, 500);
    return () => clearTimeout(t);
  }, [activePoints]);

  // ---------- derivados ----------

  const trailBase = useMemo(() => activePoints.map(toLatLng), [activePoints]);
  const lastTrailPt = trailBase[trailBase.length - 1];
  const polygonCoords = useMemo(
    () => activePoints.length >= 3 ? activePoints.map(toLatLng) : null,
    [activePoints],
  );
  const area = useMemo(() => areaHectares(activePoints), [activePoints]);
  const perimeter = useMemo(() => perimeterM(activePoints), [activePoints]);
  const validations = useMemo(() => validatePerimeterLocal(activePoints), [activePoints]);
  const canSave = activePoints.length >= 3;

  // ---------- handlers (mecânica intacta) ----------

  const handleModeChange = useCallback((m: Mode) => {
    if (m === mode) return;
    sim.reset(); tracker.reset(); setMode(m);
  }, [mode, sim, tracker]);

  const handleSimStart = useCallback(() => sim.start(selectedRouteId), [sim, selectedRouteId]);
  const handleGpsStart = useCallback(() => tracker.start(), [tracker]);

  const handleCenterMap = useCallback(() => {
    const t = activeAvatar ?? activePoints[activePoints.length - 1] ?? null;
    if (!t || !mapRef.current) return;
    mapRef.current.animateToRegion(
      { latitude: t.latitude, longitude: t.longitude, latitudeDelta: 0.018, longitudeDelta: 0.018 },
      400,
    );
  }, [activeAvatar, activePoints]);

  const doSave = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await updateImovel(imovelId, {
        geometry: { points: activePoints, area_ha: area, perimetro_m: perimeter },
      });
      if (updated) {
        const alt = analisarAlteracaoImovel(updated, DEMO_CAMADAS, 'offline-demo');
        if (alt?.relatorio.requerVisita) {
          await updateImovel(imovelId, {
            alertaDivergencia: {
              detectadoEm: Date.now(),
              delta_ha: alt.relatorio.delta_ha,
              delta_pct: alt.relatorio.delta_pct,
              severidade: alt.relatorio.severidade,
              visto: false,
            },
          });
        }
      }
      navigate({ name: 'documentos', imovelId });
    } catch {
      Alert.alert('Erro', 'Nao foi possivel salvar a demarcacao. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }, [activePoints, area, perimeter, imovelId, navigate]);

  const handleSave = useCallback(() => { if (canSave) doSave(); }, [canSave, doSave]);

  // ---------- ação primária ----------

  let primaryLabel: string;
  let primaryPress: () => void;
  let primaryDisabled: boolean | undefined;

  if (mode === 'gps') {
    if (tracker.status === 'tracking') {
      primaryLabel = 'Marcar Ponto'; primaryPress = tracker.addManualPoint;
    } else if (tracker.status === 'requesting') {
      primaryLabel = 'Aguardando GPS...'; primaryPress = () => {}; primaryDisabled = true;
    } else if (tracker.status === 'paused') {
      primaryLabel = 'Retomar GPS'; primaryPress = handleGpsStart;
    } else {
      primaryLabel = 'Iniciar GPS'; primaryPress = handleGpsStart;
    }
  } else {
    if (sim.status === 'idle') {
      primaryLabel = 'Iniciar Simulacao'; primaryPress = handleSimStart;
    } else if (sim.status === 'walking') {
      primaryLabel = 'Pausar'; primaryPress = sim.pause;
    } else if (sim.status === 'paused') {
      primaryLabel = 'Retomar'; primaryPress = sim.resume;
    } else {
      primaryLabel = 'Recomecar'; primaryPress = handleSimStart;
    }
  }

  // Seletor de rota só antes de iniciar (colapsa durante/depois)
  const showRoutePanel = mode === 'sim' && sim.status === 'idle';
  const showProgress = mode === 'sim' && (sim.status === 'walking' || sim.status === 'paused');
  // Camadas ambientais de demonstração (rio/nascente + APP) — só na rota Sorriso.
  const showEnvLayers = mode === 'sim' && selectedRouteId === DEMO_ROUTES[0]!.id;
  // Medindo ativamente? Se não, e já dá pra fechar, "Finalizar" vira a ação primária.
  const medindo = sim.status === 'walking' || tracker.status === 'tracking' || tracker.status === 'requesting';
  const finalizarPrimario = canSave && !medindo;

  // ---------- JSX ----------

  return (
    // Screen sem title/subtitle → apenas a app-bar fina (sem pageHead)
    // O indicador de passo fica no slot `right` da app-bar, sem altura extra
    <Screen right={<StepBadge />}>
      {/* ── Toggle GPS/Sim + Mapa + overlays ──────────────────────────── */}
      <View style={s.mapContainer}>
        {/* Toggle modo compacto — sobre o mapa, topo-esquerdo abaixo da gap do card */}
        <View style={s.modeToggle}>
          <TouchableOpacity
            style={[s.modeTab, mode === 'gps' && s.modeTabActive]}
            onPress={() => handleModeChange('gps')}
            activeOpacity={0.8}
          >
            <Text style={[s.modeTabText, mode === 'gps' && s.modeTabTextActive]}>GPS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modeTab, mode === 'sim' && s.modeTabActive]}
            onPress={() => handleModeChange('sim')}
            activeOpacity={0.8}
          >
            <Text style={[s.modeTabText, mode === 'sim' && s.modeTabTextActive]}>Sim</Text>
          </TouchableOpacity>
        </View>

        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={DEFAULT_REGION}
          mapType="satellite"
          showsUserLocation={mode === 'gps'}
          showsCompass
          showsScale
          onRegionChangeComplete={(r) => { currentRegionRef.current = r; }}
        >
          {/* Hidrografia e APP (só rota SORRISO_SOJA) */}
          {mode === 'sim' && selectedRouteId === DEMO_ROUTES[0]!.id && (
            <>
              {APP_POLY_COORDS.map((coords, i) =>
                coords.length >= 3 ? (
                  <Polygon key={`app-${i}`} coordinates={coords}
                    strokeColor="rgba(138,90,19,0.65)" fillColor="rgba(138,90,19,0.14)" strokeWidth={1.5} />
                ) : null,
              )}
              {HIDRO_FEATURES.map((feat, i) =>
                feat.isNascente ? (
                  <Circle key={`hidro-${i}`} center={feat.center} radius={20}
                    fillColor="rgba(37,121,199,0.45)" strokeColor="#2579c7" strokeWidth={2} />
                ) : (
                  <Polyline key={`hidro-${i}`} coordinates={feat.coords}
                    strokeColor="#2579c7" strokeWidth={3} />
                ),
              )}
            </>
          )}

          {/* Trail estático */}
          {trailBase.length > 1 && (
            <Polyline coordinates={trailBase} strokeColor={colors.verdeClaro}
              strokeWidth={3} lineDashPattern={[8, 4]} />
          )}

          {/* Segmento vivo */}
          {activeAvatar !== null && lastTrailPt !== undefined && (
            <Polyline coordinates={[lastTrailPt, toLatLng(activeAvatar)]}
              strokeColor={colors.verdeClaro} strokeWidth={3} lineDashPattern={[8, 4]} />
          )}

          {/* Polígono */}
          {polygonCoords && (
            <Polygon coordinates={polygonCoords} strokeColor={colors.verde}
              fillColor="rgba(27,107,58,0.18)" strokeWidth={2} />
          )}

          {/* Vértices */}
          {activePoints.map((p, i) => (
            <Marker key={`v-${i}`} coordinate={toLatLng(p)}
              anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={s.vertexDot}>
                <Text style={s.vertexLabel}>{i + 1}</Text>
              </View>
            </Marker>
          ))}

          {/* Avatar */}
          {activeAvatar && <AvatarMarker coordinate={activeAvatar} pulse={pulseAnim} />}
        </MapView>

        {/* HUD: card de área (topo-esquerdo) */}
        <AreaHUD area={area} perimeter={perimeter} hasPoints={canSave} />

        {/* HUD: chips de sensor */}
        <SensorChips accuracy={mode === 'gps' ? tracker.current?.accuracy : null} />

        {/* HUD: controles de mapa (coluna direita) */}
        <MapControls mapRef={mapRef} regionRef={currentRegionRef} onCenter={handleCenterMap} />

        {/* HUD: legenda das camadas ambientais (explica a linha azul + APP) */}
        {showEnvLayers && (
          <View style={s.legend}>
            <View style={s.legendItem}>
              <View style={[s.legendLine, { backgroundColor: '#2579c7' }]} />
              <Text style={s.legendText}>Rio / nascente</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendSquare, { backgroundColor: 'rgba(138,90,19,0.18)', borderColor: 'rgba(138,90,19,0.65)' }]} />
              <Text style={s.legendText}>APP (preservação)</Text>
            </View>
          </View>
        )}

        {/* HUD: linha de progresso (fina, topo do mapa, só durante caminhada) */}
        {showProgress && (
          <View style={s.progressWrap}>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { flex: sim.progress }]} />
              <View style={{ flex: 1 - sim.progress }} />
            </View>
            <Text style={s.progressPct}>
              {sim.status === 'paused' ? 'Pausado ' : ''}{Math.round(sim.progress * 100)}%
            </Text>
          </View>
        )}

        {/* HUD: hint GPS idle */}
        {mode === 'gps' && (tracker.status === 'idle' || tracker.status === 'denied') && (
          <View style={[s.gpsHint, tracker.status === 'denied' && s.gpsHintDenied]}>
            <Text style={s.gpsHintText}>
              {tracker.status === 'denied'
                ? 'Permissao de localizacao negada — verifique as configuracoes'
                : 'Toque em "Iniciar GPS" e caminhe pelo perimetro'}
            </Text>
          </View>
        )}

      </View>

      {/* ── Rodapé sólido: rota (idle) + status + botões ──────────────── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        {showRoutePanel && (
          <View style={s.routeRow}>
            <Text style={s.routePanelLabel}>Rota de demonstracao</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {DEMO_ROUTES.map((route) => {
                const active = selectedRouteId === route.id;
                return (
                  <TouchableOpacity
                    key={route.id}
                    style={[s.routeChip, active && s.routeChipActive]}
                    onPress={() => setSelectedRouteId(route.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.routeChipText, active && s.routeChipTextActive]} numberOfLines={1}>
                      {route.nome}
                    </Text>
                    <Text style={[s.routeChipBioma, active && s.routeChipTextActive]} numberOfLines={1}>
                      {route.bioma}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Status numa linha simples (substitui os boxes flutuantes do mapa) */}
        {validations.length > 0 && (
          <Text
            style={[s.statusLine, { color: validations[0]!.tone === 'ok' ? colors.verde : colors.aviso }]}
            numberOfLines={1}
          >
            {validations[0]!.msg}
          </Text>
        )}

        <View style={s.footerBtns}>
          {finalizarPrimario ? (
            <>
              {/* Pronto pra fechar: "Finalizar" é a ação principal (verde). */}
              <Button
                label="Finalizar Perimetro"
                variant="primary"
                onPress={handleSave}
                disabled={saving}
                loading={saving}
                style={s.footerBtn}
              />
              <Button
                label={primaryLabel}
                variant="outlined"
                onPress={primaryPress}
                disabled={primaryDisabled}
                style={[s.footerBtn, s.footerBtnSecond]}
              />
            </>
          ) : (
            <>
              {/* Ainda medindo/ocioso: o controle é a ação principal. */}
              <Button
                label={primaryLabel}
                variant="primary"
                onPress={primaryPress}
                disabled={primaryDisabled}
                style={s.footerBtn}
              />
              {canSave && (
                <Button
                  label="Finalizar Perimetro"
                  variant="outlined"
                  onPress={handleSave}
                  disabled={saving}
                  loading={saving}
                  style={[s.footerBtn, s.footerBtnSecond]}
                />
              )}
            </>
          )}
        </View>
      </View>
    </Screen>
  );
}

/** Indicador de passo inline na app-bar (sem altura extra). */
function StepBadge() {
  return <Text style={s.stepBadge}>2 / 4</Text>;
}

// ---------- estilos ----------

const s = StyleSheet.create({

  // ── Mapa + overlays (flex:1 — domina a tela) ────────────────────────────────
  mapContainer: {
    flex: 1,
  },

  // Toggle GPS/Sim compacto (absoluto no topo-esquerdo do mapa, z sobre o mapa)
  modeToggle: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 10,
    flexDirection: 'row',
    backgroundColor: 'rgba(234,243,230,0.92)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  modeTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabActive: { backgroundColor: colors.verde },
  modeTabText: { fontSize: 11, fontWeight: '700', color: colors.muted },
  modeTabTextActive: { color: colors.branco },

  // HUD: card de área (abaixo do toggle, deixa espaço à direita para os controles)
  areaCard: {
    position: 'absolute',
    top: 50, // abaixo do toggle GPS/Sim (~10 + 32 + 8)
    left: 10,
    right: 62,
    backgroundColor: 'rgba(249,248,246,0.92)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  areaCardLabel: {
    ...text.label,
    color: colors.mutedText,
    fontSize: 10,
    lineHeight: 13,
    marginBottom: 1,
  },
  areaCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  areaValue: { fontSize: 26, fontWeight: '800', color: colors.inkText, lineHeight: 30 },
  areaUnit: { fontSize: 15, fontWeight: '600', color: colors.inkText },
  perimeterBlock: { alignItems: 'flex-end', paddingBottom: 1 },
  perimeterLabel: { fontSize: 10, color: colors.mutedText, lineHeight: 13 },
  perimeterValue: { fontSize: 13, fontWeight: '700', color: colors.inkText },

  // HUD: chips (abaixo do card de área)
  chipsRow: {
    position: 'absolute',
    top: 130, // ~50 toggle + ~70 card height + 10 gap
    left: 10,
    right: 62,
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(249,248,246,0.92)',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 9,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  chipIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontSize: 10, color: colors.mutedText, lineHeight: 13 },
  chipValue: { fontSize: 12, fontWeight: '700', color: colors.inkText },

  // HUD: controles de mapa (coluna direita)
  mapControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    gap: 5,
  },
  mapBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(249,248,246,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },

  // HUD: linha de progresso (fina, sobre o mapa)
  progressWrap: {
    position: 'absolute',
    top: 188, // abaixo dos chips (~130 + ~48 chip height + 10)
    left: 10,
    right: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(217,228,220,0.55)',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressFill: { backgroundColor: colors.verdeClaro },
  progressPct: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.branco,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    minWidth: 38,
  },

  // HUD: badges de validação (base do mapa, lado esquerdo)
  hudBadges: {
    position: 'absolute',
    bottom: 76,
    left: 10,
    right: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },

  // HUD: card de APP ao vivo
  appCard: {
    position: 'absolute',
    bottom: 108,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(253,246,227,0.94)',
    borderRadius: 11,
    padding: 10,
    borderWidth: 1,
    borderColor: '#d4a843',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  appCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  appCardLabel: { fontSize: 10, fontWeight: '700', color: colors.aviso, textTransform: 'uppercase', letterSpacing: 0.5 },
  appCardValor: { fontSize: 12, fontWeight: '800', color: colors.aviso },
  appFeicao: { fontSize: 11, color: colors.muted, paddingLeft: 4, marginBottom: 1 },
  appZero: { fontSize: 11, color: colors.verde, fontStyle: 'italic' },

  // HUD: seletor de rota (base do mapa, só quando idle)
  routePanel: {
    position: 'absolute',
    bottom: 12,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(249,248,246,0.95)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -1 },
    elevation: 5,
  },
  routePanelLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  routeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.verdeBg,
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: 6,
    maxWidth: 150,
  },
  routeChipActive: { backgroundColor: colors.verdeClaro, borderColor: colors.verdeClaro },
  routeChipText: { fontSize: 11.5, fontWeight: '700', color: colors.muted },
  routeChipTextActive: { color: colors.branco },
  routeChipBioma: { fontSize: 9.5, fontWeight: '600', color: colors.verde, marginTop: 1 },

  // HUD: hint GPS idle/denied
  gpsHint: {
    position: 'absolute',
    bottom: 12,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(249,248,246,0.92)',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  gpsHintDenied: { backgroundColor: 'rgba(251,234,233,0.94)' },
  gpsHintText: { fontSize: 13, fontWeight: '600', color: colors.inkText, textAlign: 'center', lineHeight: 18 },

  // HUD: cue de conclusão
  doneCue: {
    position: 'absolute',
    bottom: 12,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(226,243,232,0.96)',
    borderRadius: 11,
    padding: 10,
    alignItems: 'center',
  },
  doneCueText: { color: colors.verde, fontWeight: '700', fontSize: 12, lineHeight: 17, textAlign: 'center' },

  // HUD: legenda das camadas ambientais (rio/nascente + APP)
  legend: {
    position: 'absolute',
    bottom: 14,
    left: 10,
    backgroundColor: 'rgba(249,248,246,0.92)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 5,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendLine: { width: 16, height: 3, borderRadius: 2 },
  legendSquare: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 },
  legendText: { fontSize: 11, fontWeight: '700', color: colors.inkText },

  // ── Rodapé sólido (rota + status + botões) ──────────────────────────────────
  footer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    // paddingBottom vem do safe-area inset (proporcional ao aparelho) — aplicado inline.
    backgroundColor: colors.neutral,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    // Cantos arredondados no topo dão a sensação de "folha" subindo sobre o mapa.
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
  },
  routeRow: { marginBottom: 14 },
  statusLine: { fontSize: 14, fontWeight: '700', marginBottom: 14, textAlign: 'center' },
  // Botões empilhados (anula o flex:1 das variantes).
  footerBtns: {},
  footerBtn: { flexGrow: 0, minHeight: 52, paddingVertical: 12 },
  footerBtnSecond: { marginTop: 10 },

  // ── Step badge na app-bar ────────────────────────────────────────────────────
  stepBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.mutedText,
    backgroundColor: colors.verdeBg,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },

  // ── Avatar ───────────────────────────────────────────────────────────────────
  avatarWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  avatarRing: {
    position: 'absolute', width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.verdeClaro,
  },
  avatarDot: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.branco,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4, elevation: 4,
  },
  avatarEmoji: { fontSize: 18, lineHeight: 22 },

  // ── Vértices ─────────────────────────────────────────────────────────────────
  vertexDot: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: colors.verde,
    borderWidth: 2, borderColor: colors.branco, alignItems: 'center', justifyContent: 'center',
  },
  vertexLabel: { fontSize: 9, fontWeight: '800', color: colors.branco },
});
