// Tela de Demarcação — Passo 2 do wizard.
// Suporta dois modos: GPS real (usePerimeterTracker) e Simulação de caminhada (useSimulatedWalk).
// Offline-first: grava geometry localmente via updateImovel; nunca bloqueia por falta de rede.
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
import MapView, { Circle, Marker, Polygon, Polyline } from 'react-native-maps';

import { Screen } from '../app/Screen';
import { WizardSteps } from '../app/WizardSteps';
import { useNav } from '../app/navigation';
import { areaHectares, perimeterM, simplifyRDP, type LngLat } from '../lib/geo';
import { getImovel, updateImovel } from '../lib/store';
import { DEMO_ROUTES } from '../sim/routes';
import { useSimulatedWalk } from '../sim/useSimulatedWalk';
import { usePerimeterTracker } from '../hooks/usePerimeterTracker';
import { Badge, Button } from '../ui';
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
    issues.push({ msg: `Faltam ${3 - points.length} vertice(s) para fechar o poligono`, tone: 'aviso' });
    return issues;
  }
  const area = areaHectares(points);
  if (area < 0.05) {
    issues.push({ msg: `Area muito pequena (${(area * 10000).toFixed(0)} m²) — verifique os pontos`, tone: 'aviso' });
  } else if (area > 2500) {
    issues.push({ msg: `Area acima de 2.500 ha — confirme os vertices`, tone: 'aviso' });
  } else {
    issues.push({ msg: `Poligono valido (${area.toFixed(2)} ha)`, tone: 'ok' });
  }
  return issues;
}

// ---------- constantes ----------

const DEFAULT_REGION = {
  latitude: DEMO_ROUTES[0]!.vertices[0]!.latitude,
  longitude: DEMO_ROUTES[0]!.vertices[0]!.longitude,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

// ---------- camadas estáticas de hidrografia e APP ----------
// Computadas uma vez no carregamento do módulo — DEMO_HIDROGRAFIA é imutável.

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
  } else {
    const coords = ring.map((coord) => ({
      latitude: coord[1] ?? 0,
      longitude: coord[0] ?? 0,
    }));
    return { isNascente: false as const, coords };
  }
});

const APP_POLY_COORDS = APP_CAMADAS_DEMO.map((feat) => {
  const ring = feat.rings[0] ?? [];
  return ring.map((coord) => ({
    latitude: coord[1] ?? 0,
    longitude: coord[0] ?? 0,
  }));
});

// ---------- sub-componentes do HUD ----------

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <View style={s.modeRow}>
      <TouchableOpacity
        style={[s.modeBtn, mode === 'gps' && s.modeBtnActive]}
        onPress={() => onChange('gps')}
        activeOpacity={0.8}
      >
        <Text style={[s.modeBtnText, mode === 'gps' && s.modeBtnTextActive]}>GPS real</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.modeBtn, mode === 'sim' && s.modeBtnActive]}
        onPress={() => onChange('sim')}
        activeOpacity={0.8}
      >
        <Text style={[s.modeBtnText, mode === 'sim' && s.modeBtnTextActive]}>Simular caminhada</Text>
      </TouchableOpacity>
    </View>
  );
}

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

/** Card de área/perímetro flutuante no topo do mapa (mockup P2). */
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

/** Chips de sensor: Precisão GPS + Acelerômetro (mockup P2). */
function SensorChips({ accuracy }: { accuracy: number | null | undefined }) {
  const accLabel = accuracy != null ? `${accuracy.toFixed(1)} m` : '-- m';
  return (
    <View style={s.chipsRow}>
      <View style={s.sensorChip}>
        <View style={[s.sensorIcon, { backgroundColor: colors.primary }]}>
          <Ionicons name="locate" size={18} color={colors.branco} />
        </View>
        <View>
          <Text style={s.sensorLabel}>Precisao GPS</Text>
          <Text style={s.sensorValue}>{accLabel}</Text>
        </View>
      </View>
      {/* ponytail: acelerômetro não exposto pelo tracker; placeholder estático coerente com mockup */}
      <View style={s.sensorChip}>
        <View style={[s.sensorIcon, { backgroundColor: colors.secondary }]}>
          <Ionicons name="phone-portrait-outline" size={18} color={colors.branco} />
        </View>
        <View>
          <Text style={s.sensorLabel}>Acelerometro</Text>
          <Text style={s.sensorValue}>Estavel</Text>
        </View>
      </View>
    </View>
  );
}

type RegionLike = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

/** Controles de zoom, centralizar e camadas (mockup P2 — coluna direita do mapa). */
function MapControls({
  mapRef,
  regionRef,
  onCenter,
}: {
  mapRef: React.RefObject<MapView | null>;
  regionRef: React.MutableRefObject<RegionLike>;
  onCenter: () => void;
}) {
  const zoom = (factor: number) => {
    const r = regionRef.current;
    mapRef.current?.animateToRegion(
      { ...r, latitudeDelta: r.latitudeDelta * factor, longitudeDelta: r.longitudeDelta * factor },
      250,
    );
  };

  return (
    <View style={s.mapControls}>
      <TouchableOpacity style={s.mapBtn} onPress={() => zoom(0.5)} activeOpacity={0.8}>
        <Ionicons name="add" size={22} color={colors.inkText} />
      </TouchableOpacity>
      <TouchableOpacity style={s.mapBtn} onPress={() => zoom(2)} activeOpacity={0.8}>
        <Ionicons name="remove" size={22} color={colors.inkText} />
      </TouchableOpacity>
      <TouchableOpacity style={s.mapBtn} onPress={onCenter} activeOpacity={0.8}>
        <Ionicons name="navigate-circle-outline" size={22} color={colors.inkText} />
      </TouchableOpacity>
      {/* ponytail: toggle de camadas — visual apenas, sem lógica nova de mapa */}
      <TouchableOpacity style={s.mapBtn} activeOpacity={0.8}>
        <Ionicons name="layers-outline" size={22} color={colors.inkText} />
      </TouchableOpacity>
    </View>
  );
}

// ---------- tela principal ----------

export function DemarcacaoScreen({ imovelId }: { imovelId: string }) {
  const { navigate } = useNav();
  const [mode, setMode] = useState<Mode>('sim');
  const [selectedRouteId, setSelectedRouteId] = useState(DEMO_ROUTES[0]!.id);
  const [saving, setSaving] = useState(false);
  const [imovelLoaded, setImovelLoaded] = useState(false);
  const [appResultado, setAppResultado] = useState<AppResultado | null>(null);

  // Hooks de captura (ambos sempre ativos — lei dos hooks)
  const sim = useSimulatedWalk();
  const tracker = usePerimeterTracker();

  // Referência do mapa para animateToRegion
  const mapRef = useRef<MapView>(null);
  const lastRegionUpdateRef = useRef(0);
  // ponytail: região atual rastreada pelo onRegionChangeComplete para os botões de zoom
  const currentRegionRef = useRef<RegionLike>(DEFAULT_REGION);

  // Animação de pulso do avatar
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  // Pontos e avatar ativos conforme o modo
  const activePoints: LngLat[] = mode === 'sim' ? sim.points : tracker.points;
  const activeAvatar: LngLat | null = mode === 'sim' ? sim.avatar : tracker.current;

  // ---------- efeito: carrega geometry existente ----------
  // O produtor mede ÀS CEGAS: a tela não mostra o perímetro registrado nem o delta.
  useEffect(() => {
    let alive = true;
    getImovel(imovelId).then((imovel) => {
      if (!alive || !imovel) return;
      setImovelLoaded(true);
    });
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

  // ---------- efeito: segue o avatar no mapa (throttled a 1 Hz) ----------
  useEffect(() => {
    if (!activeAvatar || !mapRef.current) return;
    const now = Date.now();
    if (now - lastRegionUpdateRef.current < 1000) return;
    lastRegionUpdateRef.current = now;
    mapRef.current.animateToRegion(
      {
        latitude: activeAvatar.latitude,
        longitude: activeAvatar.longitude,
        latitudeDelta: 0.006,
        longitudeDelta: 0.006,
      },
      500,
    );
  }, [activeAvatar]);

  // ---------- APP: cálculo ao vivo com debounce ----------
  useEffect(() => {
    if (activePoints.length < 3) {
      setAppResultado(null);
      return;
    }
    const timer = setTimeout(() => {
      try {
        const simplified = simplifyRDP(activePoints, 3);
        const pts = simplified.length >= 3 ? simplified : activePoints;
        setAppResultado(appDentroDoImovel(pts, APP_CAMADAS_DEMO));
      } catch {
        // Geometria inválida — não quebrar a UI (offline-first)
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [activePoints]);

  // ---------- polígono / polyline ----------

  // Trail estático: só recalcula quando um vértice é marcado (não a cada tick de 30fps).
  const trailBase = useMemo(() => activePoints.map(toLatLng), [activePoints]);
  const lastTrailPt = trailBase.length > 0 ? trailBase[trailBase.length - 1] : undefined;
  const polygonCoords = useMemo(() => {
    if (activePoints.length < 3) return null;
    return activePoints.map(toLatLng);
  }, [activePoints]);

  // ---------- stats derivadas ----------
  const area = useMemo(() => areaHectares(activePoints), [activePoints]);
  const perimeter = useMemo(() => perimeterM(activePoints), [activePoints]);
  const validations = useMemo(() => validatePerimeterLocal(activePoints), [activePoints]);

  // ---------- handlers ----------

  const handleModeChange = useCallback(
    (m: Mode) => {
      if (m === mode) return;
      sim.reset();
      tracker.reset();
      setMode(m);
    },
    [mode, sim, tracker],
  );

  const handleSimStart = useCallback(() => {
    sim.start(selectedRouteId);
  }, [sim, selectedRouteId]);

  const doSave = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await updateImovel(imovelId, {
        geometry: {
          points: activePoints,
          area_ha: area,
          perimetro_m: perimeter,
        },
      });
      // Por baixo dos panos: compara com o registro anterior e, se divergir, grava informe.
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

  const handleSave = useCallback(() => {
    if (activePoints.length < 3) return;
    doSave();
  }, [activePoints.length, doSave]);

  const handleGpsStart = useCallback(() => {
    tracker.start();
  }, [tracker]);

  const handleCenterMap = useCallback(() => {
    const target = activeAvatar ?? (activePoints.length > 0 ? activePoints[activePoints.length - 1] : null);
    if (!target || !mapRef.current) return;
    mapRef.current.animateToRegion(
      { latitude: target.latitude, longitude: target.longitude, latitudeDelta: 0.006, longitudeDelta: 0.006 },
      400,
    );
  }, [activeAvatar, activePoints]);

  // ---------- ação principal ("Marcar Ponto") ----------

  const canSave = activePoints.length >= 3;

  let primaryLabel: string;
  let primaryPress: () => void;
  let primaryDisabled: boolean | undefined;

  if (mode === 'gps') {
    if (tracker.status === 'tracking') {
      primaryLabel = 'Marcar Ponto';
      primaryPress = tracker.addManualPoint;
    } else if (tracker.status === 'requesting') {
      primaryLabel = 'Aguardando GPS...';
      primaryPress = () => {};
      primaryDisabled = true;
    } else if (tracker.status === 'paused') {
      primaryLabel = 'Retomar GPS';
      primaryPress = handleGpsStart;
    } else {
      primaryLabel = 'Iniciar GPS';
      primaryPress = handleGpsStart;
    }
  } else {
    // sim
    if (sim.status === 'idle') {
      primaryLabel = 'Iniciar Simulacao';
      primaryPress = handleSimStart;
    } else if (sim.status === 'walking') {
      primaryLabel = 'Pausar';
      primaryPress = sim.pause;
    } else if (sim.status === 'paused') {
      primaryLabel = 'Retomar';
      primaryPress = sim.resume;
    } else {
      // done — "Finalizar Perimetro" (outlined) cuida do save; aqui fica o recomecar
      primaryLabel = 'Recomecar';
      primaryPress = handleSimStart;
    }
  }

  // ---------- painéis de modo (tira de controle abaixo do mapa) ----------

  const simPanel = (
    <View>
      <Text style={s.stripLabel}>Rota de demonstracao</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.routeScroll}>
        {DEMO_ROUTES.map((route) => {
          const active = selectedRouteId === route.id;
          return (
            <TouchableOpacity
              key={route.id}
              style={[s.routeChip, active && s.routeChipActive]}
              onPress={() => setSelectedRouteId(route.id)}
              disabled={sim.status === 'walking'}
            >
              <Text style={[s.routeChipText, active && s.routeChipTextActive]} numberOfLines={2}>
                {route.nome}
              </Text>
              <Text style={[s.routeChipBioma, active && s.routeChipTextActive]} numberOfLines={1}>
                {route.bioma}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {sim.status !== 'idle' && (
        <>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { flex: sim.progress }]} />
            <View style={{ flex: 1 - sim.progress }} />
          </View>
          <Text style={s.progressText}>
            {sim.status === 'walking'
              ? `Caminhando... ${Math.round(sim.progress * 100)}%`
              : sim.status === 'paused'
                ? `Pausado em ${Math.round(sim.progress * 100)}%`
                : 'Caminhada concluida'}
          </Text>
        </>
      )}
    </View>
  );

  const gpsPanel = (
    <View>
      {tracker.status === 'denied' && (
        <Badge tone="aviso">Permissao de localizacao negada. Verifique as configuracoes.</Badge>
      )}
      {tracker.status !== 'denied' && (
        <Text style={s.gpsHint}>
          {tracker.status === 'tracking'
            ? 'Caminhe rente a divisa. Use "Marcar Ponto" nas quinas.'
            : 'Toque em "Iniciar GPS" abaixo e ande pelo perimetro do imovel.'}
        </Text>
      )}
    </View>
  );

  // ---------- JSX principal ----------

  return (
    <Screen
      title="Demarcacao"
      subtitle={
        imovelLoaded
          ? mode === 'sim'
            ? 'Simulando caminhada no perimetro'
            : 'Caminhe pelo perimetro do imovel'
          : 'Carregando...'
      }
    >
      <WizardSteps active={1} />

      {/* Mapa + HUD overlay — ocupa todo o espaço restante */}
      <View style={s.mapContainer}>
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
          {/* Hidrografia e APP — só na rota SORRISO_SOJA (fixtures localizadas) */}
          {mode === 'sim' && selectedRouteId === DEMO_ROUTES[0]!.id && (
            <>
              {APP_POLY_COORDS.map((coords, i) =>
                coords.length >= 3 ? (
                  <Polygon
                    key={`app-${i}`}
                    coordinates={coords}
                    strokeColor="rgba(138,90,19,0.65)"
                    fillColor="rgba(138,90,19,0.14)"
                    strokeWidth={1.5}
                  />
                ) : null,
              )}
              {HIDRO_FEATURES.map((feat, i) =>
                feat.isNascente ? (
                  <Circle
                    key={`hidro-${i}`}
                    center={feat.center}
                    radius={20}
                    fillColor="rgba(37,121,199,0.45)"
                    strokeColor="#2579c7"
                    strokeWidth={2}
                  />
                ) : (
                  <Polyline
                    key={`hidro-${i}`}
                    coordinates={feat.coords}
                    strokeColor="#2579c7"
                    strokeWidth={3}
                  />
                ),
              )}
            </>
          )}

          {/* Trail estático: vértice a vértice */}
          {trailBase.length > 1 && (
            <Polyline
              coordinates={trailBase}
              strokeColor={colors.verdeClaro}
              strokeWidth={3}
              lineDashPattern={[8, 4]}
            />
          )}

          {/* Segmento vivo: último vértice → avatar */}
          {activeAvatar !== null && lastTrailPt !== undefined && (
            <Polyline
              coordinates={[lastTrailPt, toLatLng(activeAvatar)]}
              strokeColor={colors.verdeClaro}
              strokeWidth={3}
              lineDashPattern={[8, 4]}
            />
          )}

          {/* Polígono quando há vértices suficientes */}
          {polygonCoords && (
            <Polygon
              coordinates={polygonCoords}
              strokeColor={colors.verde}
              fillColor="rgba(27,107,58,0.18)"
              strokeWidth={2}
            />
          )}

          {/* Vértices */}
          {activePoints.map((p, i) => (
            <Marker
              key={`v-${i}`}
              coordinate={toLatLng(p)}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={s.vertexDot}>
                <Text style={s.vertexLabel}>{i + 1}</Text>
              </View>
            </Marker>
          ))}

          {/* Avatar animado */}
          {activeAvatar && <AvatarMarker coordinate={activeAvatar} pulse={pulseAnim} />}
        </MapView>

        {/* HUD: card de área (canto superior) */}
        <AreaHUD area={area} perimeter={perimeter} hasPoints={activePoints.length >= 3} />

        {/* HUD: chips de sensor (abaixo do card) */}
        <SensorChips accuracy={mode === 'gps' ? tracker.current?.accuracy : null} />

        {/* HUD: controles de mapa (coluna direita) */}
        <MapControls mapRef={mapRef} regionRef={currentRegionRef} onCenter={handleCenterMap} />

        {/* HUD: badge de validação flutuante (base do mapa) */}
        {validations.length > 0 && (
          <View style={s.hudBadges}>
            {validations.map((v, i) => (
              <Badge key={i} tone={v.tone}>{v.msg}</Badge>
            ))}
          </View>
        )}

        {/* HUD: cue de conclusão */}
        {mode === 'sim' && sim.status === 'done' && activePoints.length >= 3 && (
          <View style={s.doneCue}>
            <Text style={s.doneCueText}>
              Caminhada concluida — {activePoints.length} vertices, {area.toFixed(2)} ha.
              Toque em "Finalizar Perimetro" abaixo.
            </Text>
          </View>
        )}
      </View>

      {/* Tira de controles: modo + painel ativo + card de APP */}
      <ScrollView
        style={s.controlStrip}
        contentContainerStyle={s.controlStripContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ModeToggle mode={mode} onChange={handleModeChange} />
        <View style={s.stripPanel}>{mode === 'sim' ? simPanel : gpsPanel}</View>

        {/* Card de APP ao vivo */}
        {appResultado !== null && (
          <View style={s.appCard}>
            <View style={s.appCardHeader}>
              <Text style={s.appCardLabel}>APP dentro do desenho</Text>
              <Text style={s.appCardValor}>
                {appResultado.app_ha.toFixed(2)} ha ({appResultado.porcentagem.toFixed(1)}%)
              </Text>
            </View>
            {appResultado.feicoes.length > 0 ? (
              appResultado.feicoes.map((f, i) => (
                <Text key={i} style={s.appFeicao}>
                  {f.tipo === 'nascente' ? 'Nascente' : 'Margem de rio'}: {f.ha.toFixed(2)} ha
                </Text>
              ))
            ) : (
              <Text style={s.appZero}>Nenhuma APP detectada no desenho atual</Text>
            )}
            <Text style={s.appDisclaimer}>
              Estimativa de campo — nao substitui a APP oficial homologada
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Rodapé fixo: Finalizar Perímetro (outlined) + Marcar Ponto (primary verde) */}
      <View style={s.footer}>
        <Button
          label="Finalizar Perimetro"
          variant="outlined"
          onPress={handleSave}
          disabled={!canSave || saving}
          loading={saving}
          style={s.footerBtn}
        />
        <View style={s.btnGap} />
        <Button
          label={primaryLabel}
          variant="primary"
          onPress={primaryPress}
          disabled={primaryDisabled}
          style={s.footerBtn}
        />
      </View>
    </Screen>
  );
}

// ---------- estilos ----------

const s = StyleSheet.create({

  // ── Mapa ────────────────────────────────────────────────────────────────────

  mapContainer: {
    flex: 1,
    minHeight: 260,
  },

  // HUD: card de área (topo, sobreposto ao mapa)
  areaCard: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 68, // margem para os botões de mapa à direita
    backgroundColor: 'rgba(249,248,246,0.94)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.13,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  areaCardLabel: {
    ...text.label,
    color: colors.mutedText,
    marginBottom: 2,
  },
  areaCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  areaValue: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.inkText,
    lineHeight: 38,
  },
  areaUnit: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.inkText,
  },
  perimeterBlock: {
    alignItems: 'flex-end',
    paddingBottom: 2,
  },
  perimeterLabel: {
    ...text.caption,
    color: colors.mutedText,
  },
  perimeterValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.inkText,
  },

  // HUD: chips de sensor (abaixo do card de área)
  chipsRow: {
    position: 'absolute',
    top: 110, // below areaCard (top:12 + ~86px card height + 12px gap)
    left: 12,
    right: 68,
    flexDirection: 'row',
    gap: 8,
  },
  sensorChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(249,248,246,0.94)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  sensorIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sensorLabel: {
    ...text.caption,
    color: colors.mutedText,
  },
  sensorValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkText,
  },

  // HUD: controles de mapa (coluna direita)
  mapControls: {
    position: 'absolute',
    top: 12,
    right: 12,
    gap: 6,
  },
  mapBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(249,248,246,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },

  // HUD: badges de validação (base do mapa)
  hudBadges: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },

  // HUD: cue de conclusão
  doneCue: {
    position: 'absolute',
    bottom: 40,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(226,243,232,0.96)',
    borderRadius: 12,
    padding: 10,
  },
  doneCueText: {
    color: colors.verde,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },

  // ── Tira de controles ───────────────────────────────────────────────────────

  controlStrip: {
    maxHeight: 180,
    backgroundColor: colors.branco,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  controlStripContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  stripPanel: {
    marginTop: 2,
  },
  stripLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // Modo toggle
  modeRow: {
    flexDirection: 'row',
    backgroundColor: colors.verdeBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    marginBottom: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: colors.verde,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  modeBtnTextActive: {
    color: colors.branco,
  },

  // Sim panel
  routeScroll: {
    marginBottom: 4,
  },
  routeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.verdeBg,
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: 8,
    maxWidth: 200,
  },
  routeChipActive: {
    backgroundColor: colors.verdeClaro,
    borderColor: colors.verdeClaro,
  },
  routeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  routeChipTextActive: {
    color: colors.branco,
  },
  routeChipBioma: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.verde,
    marginTop: 2,
  },
  progressBar: {
    flexDirection: 'row',
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 4,
  },
  progressFill: {
    backgroundColor: colors.verdeClaro,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.verde,
  },
  gpsHint: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    paddingVertical: 4,
  },

  // Card de APP (na tira de controles)
  appCard: {
    backgroundColor: '#fdf6e3',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#d4a843',
  },
  appCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  appCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.aviso,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  appCardValor: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.aviso,
  },
  appFeicao: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 2,
    paddingLeft: 6,
  },
  appZero: {
    fontSize: 12,
    color: colors.verde,
    fontStyle: 'italic',
  },
  appDisclaimer: {
    fontSize: 10,
    color: colors.muted,
    fontStyle: 'italic',
    marginTop: 4,
  },

  // ── Rodapé ──────────────────────────────────────────────────────────────────

  footer: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 28,
    backgroundColor: colors.branco,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  footerBtn: {
    flex: 1,
  },
  btnGap: {
    width: 10,
  },

  // ── Avatar no mapa ───────────────────────────────────────────────────────────

  avatarWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.verdeClaro,
  },
  avatarDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.branco,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  avatarEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },

  // ── Vértices no mapa ─────────────────────────────────────────────────────────

  vertexDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.verde,
    borderWidth: 2,
    borderColor: colors.branco,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vertexLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.branco,
  },
});
