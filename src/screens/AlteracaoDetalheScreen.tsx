import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Polygon } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../app/Screen';
import { Card } from '../ui';
import { colors } from '../theme/colors';
import { text } from '../theme/typography';
import { getImovel } from '../lib/store';
import { analisarAlteracaoImovel, type AlteracaoImovel } from '../lib/alteracao';
import { DEMO_CAMADAS } from '../lib/refLayers.demo';
import type { LngLat } from '../lib/geo';
import type { Imovel } from '../types';

const MAP_HEIGHT = Math.max(240, Math.floor(Dimensions.get('window').height * 0.40));
const toLatLng = (p: LngLat) => ({ latitude: p.latitude, longitude: p.longitude });

export function AlteracaoDetalheScreen({ imovelId }: { imovelId: string }) {
  const [imovel, setImovel] = useState<Imovel | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDadosGoverno, setShowDadosGoverno] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    getImovel(imovelId).then((im) => {
      if (!alive) return;
      setImovel(im);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [imovelId]);
  useEffect(() => load(), [load]);

  const alteracao: AlteracaoImovel | null = useMemo(
    () => (imovel ? analisarAlteracaoImovel(imovel, DEMO_CAMADAS, 'offline-demo') : null),
    [imovel],
  );

  if (loading) {
    return (
      <Screen title="Análise de Confrontação">
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!imovel || !alteracao) {
    return (
      <Screen title="Análise de Confrontação" subtitle={imovel?.imovel.nome ?? ''}>
        <View style={s.center}>
          <Text style={s.semAlt}>
            Sem alteração de perímetro detectada — não há registro anterior comparável.
          </Text>
        </View>
      </Screen>
    );
  }

  const r = alteracao.relatorio;
  const isCritico = r.severidade === 'critico';
  const isAlto = r.severidade === 'alto';
  const novoCoords = imovel.geometry.points.map(toLatLng);
  const anteriorCoords = alteracao.anteriorPoints.map(toLatLng);
  const region = {
    latitude: imovel.geometry.points[0]!.latitude,
    longitude: imovel.geometry.points[0]!.longitude,
    latitudeDelta: 0.012,
    longitudeDelta: 0.012,
  };

  // Banner visível apenas em critico/alto (não polui telas normais)
  const bannerText = isCritico
    ? 'STATUS: CRÍTICO – DIVERGÊNCIA DE ÁREA'
    : isAlto
    ? 'STATUS: ALTO – ALTERAÇÃO SIGNIFICATIVA'
    : null;
  const bannerColor = isCritico ? colors.critico : colors.aviso;

  return (
    <Screen title="Análise de Confrontação" subtitle={imovel.imovel.nome || 'Imóvel sem nome'}>
      <View style={s.mapContainer}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={region}
          mapType="terrain"
        >
          {novoCoords.length >= 3 && (
            <Polygon
              coordinates={novoCoords}
              strokeColor={colors.tertiary}
              fillColor="rgba(0,168,232,0.15)"
              strokeWidth={2}
            />
          )}
          {showDadosGoverno && anteriorCoords.length >= 3 && (
            <Polygon
              coordinates={anteriorCoords}
              strokeColor={colors.critico}
              fillColor="rgba(163,48,42,0.08)"
              strokeWidth={2}
            />
          )}
        </MapView>

        {bannerText !== null && (
          <View style={[s.statusBanner, { borderColor: bannerColor }]}>
            <Ionicons name="alert-circle-outline" size={15} color={bannerColor} />
            <Text style={[s.statusBannerText, { color: bannerColor }]}>{bannerText}</Text>
          </View>
        )}

        <TouchableOpacity
          style={s.toggleRow}
          onPress={() => setShowDadosGoverno((v) => !v)}
          activeOpacity={0.8}
        >
          <View style={[s.checkbox, showDadosGoverno && s.checkboxOn]}>
            {showDadosGoverno && <Ionicons name="checkmark" size={11} color={colors.branco} />}
          </View>
          <Text style={s.toggleLabel}>Dados Governo</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.headline}>Análise de Confrontação</Text>
        <Text style={s.headlineSub}>
          Relatório gerado automaticamente via análise geoespacial multitemporal.
        </Text>

        <Card>
          <Text style={s.areaLabel}>ÁREA PRODUTOR</Text>
          <View style={s.areaRow}>
            <Text style={[s.areaValue, { color: colors.primary }]}>
              {r.areaNova_ha.toFixed(1)}
            </Text>
            <Text style={s.areaUnit}> ha</Text>
          </View>
          <View style={s.precisionRow}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.tertiary} />
            <Text style={s.precisionText}>Surveying L2 Precision</Text>
          </View>
        </Card>

        <Card>
          <Text style={s.areaLabel}>ÁREA GOVERNO</Text>
          <View style={s.areaRow}>
            <Text style={s.areaValue}>{r.areaAnterior_ha.toFixed(1)}</Text>
            <Text style={s.areaUnit}> ha</Text>
          </View>
          <Text style={s.baselineNote}>
            {alteracao.baseline === 'real' ? 'Registro oficial do CAR' : 'Baseline de referência (demo)'}
          </Text>
        </Card>

        <Card>
          <Text style={s.sectionLabel}>DIFERENÇA DETECTADA</Text>
          <View style={s.metricsRow}>
            <DeltaCol
              label="DIFERENÇA"
              value={`${r.delta_ha >= 0 ? '+' : ''}${r.delta_ha.toFixed(2)} ha`}
              sub={`${r.delta_pct >= 0 ? '+' : ''}${r.delta_pct.toFixed(1)}%`}
              valueColor={isCritico ? colors.critico : isAlto ? colors.aviso : colors.inkText}
            />
            <DeltaCol
              label="ACRESCIDO"
              value={`${r.acrescido_ha.toFixed(2)} ha`}
              valueColor={colors.acrescido}
            />
            <DeltaCol
              label="SUPRIMIDO"
              value={`${r.suprimido_ha.toFixed(2)} ha`}
              valueColor={colors.suprimido}
            />
          </View>
          {r.incertezaGPS_m != null && (
            <Text style={s.incerteza}>
              Incerteza GPS ~{r.incertezaGPS_m.toFixed(0)} m — variações menores que ~{(2 * r.incertezaGPS_m).toFixed(0)} m podem ser ruído.
            </Text>
          )}
        </Card>

        <Card>
          <Text style={s.sectionLabel}>RECOMENDAÇÃO</Text>
          <Text style={s.recomendacao}>{r.recomendacao}</Text>
        </Card>

        <Text style={s.disclaimer}>
          {alteracao.baseline === 'demo' ? 'Comparação contra baseline de demonstração. ' : ''}
          Camadas offline — valide com dados oficiais quando houver rede.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function DeltaCol({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <View style={s.deltaCol}>
      <Text style={s.deltaColLabel}>{label}</Text>
      <Text style={[s.deltaColValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
      {sub ? <Text style={s.deltaColSub}>{sub}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  semAlt: { ...text.body, color: colors.mutedText, textAlign: 'center' },

  mapContainer: { height: MAP_HEIGHT },

  statusBanner: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.93)',
  },
  statusBannerText: { ...text.label, flex: 1, fontSize: 11 },

  toggleRow: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.93)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: colors.critico,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.critico, borderColor: colors.critico },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: colors.inkText },

  content:     { padding: 16, paddingBottom: 32, gap: 12 },
  headline:    { ...text.headline, color: colors.primary, marginBottom: 2 },
  headlineSub: { ...text.body, color: colors.mutedText, marginBottom: 4 },

  areaLabel:    { ...text.label, color: colors.mutedText, marginBottom: 4 },
  areaRow:      { flexDirection: 'row', alignItems: 'flex-end' },
  areaValue:    { fontSize: 40, fontWeight: '800', color: colors.inkText, lineHeight: 46 },
  areaUnit:     { fontSize: 18, fontWeight: '600', color: colors.mutedText, paddingBottom: 5 },
  precisionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  precisionText:{ fontSize: 13, fontWeight: '600', color: colors.tertiary },
  baselineNote: { ...text.caption, color: colors.mutedText, marginTop: 6 },

  sectionLabel:  { ...text.label, color: colors.mutedText, marginBottom: 10 },
  metricsRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  deltaCol:      { flex: 1, alignItems: 'center' },
  deltaColLabel: { ...text.label, color: colors.mutedText, fontSize: 10 },
  deltaColValue: { fontSize: 16, fontWeight: '800', color: colors.inkText, marginTop: 3 },
  deltaColSub:   { ...text.caption, color: colors.mutedText, marginTop: 1 },
  incerteza:     { ...text.caption, color: colors.mutedText, fontStyle: 'italic', lineHeight: 15, marginTop: 8 },

  recomendacao: { ...text.body, color: colors.inkText, lineHeight: 22 },
  disclaimer:   { ...text.caption, color: colors.mutedText, fontStyle: 'italic', lineHeight: 15 },
});
