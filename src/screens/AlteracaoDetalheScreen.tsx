// Detalhe da alteração de perímetro (ANALISTA).
// Mini-mapa antes × depois, "o que mudou" (camadas tocadas), recomendação e
// ações de aceite (Reprovar / Agendar visita / Aprovar). Acessível de Validação,
// Painel (fila de visitas) e Revisão.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Polygon, Polyline } from 'react-native-maps';

import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { PrimaryButton, SecondaryButton } from '../ui';
import { colors } from '../theme/colors';
import { getImovel, updateImovel } from '../lib/store';
import { analisarAlteracaoImovel, decisaoSugerida, type AlteracaoImovel } from '../lib/alteracao';
import { DEMO_CAMADAS } from '../lib/refLayers.demo';
import type { CamadaTipo, Sobreposicao } from '../lib/overlay';
import type { LngLat } from '../lib/geo';
import type { Imovel, ValidacaoStatus } from '../types';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAP_HEIGHT = Math.max(200, Math.floor(SCREEN_HEIGHT * 0.30));

const toLatLng = (p: LngLat) => ({ latitude: p.latitude, longitude: p.longitude });

function tipoLabel(tipo: CamadaTipo): string {
  switch (tipo) {
    case 'terra_indigena':      return 'Terra Indígena';
    case 'unidade_conservacao': return 'Unidade de Conservação';
    case 'embargo_ibama':       return 'Embargo IBAMA';
    case 'desmatamento':        return 'Desmatamento';
    case 'queimada':            return 'Queimada';
    case 'app_hidrografia':     return 'APP / rio';
    case 'hidrografia':         return 'Hidrografia';
    case 'car_vizinho':         return 'CAR vizinho';
  }
}

const toneColor = { ok: colors.verde, aviso: colors.aviso, alerta: colors.alerta } as const;
const toneBg = { ok: '#e2f3e8', aviso: '#fdf4e3', alerta: '#fce8e7' } as const;

export function AlteracaoDetalheScreen({ imovelId }: { imovelId: string }) {
  const { goBack } = useNav();
  const [imovel, setImovel] = useState<Imovel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    getImovel(imovelId).then((im) => {
      if (!alive) return;
      setImovel(im);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [imovelId]);
  useEffect(() => load(), [load]);

  const alteracao: AlteracaoImovel | null = useMemo(
    () => (imovel ? analisarAlteracaoImovel(imovel, DEMO_CAMADAS, 'offline-demo') : null),
    [imovel],
  );

  const concordancia = useMemo(() => {
    if (!alteracao) return null;
    const r = alteracao.relatorio;
    const uniao = r.areaNova_ha + r.suprimido_ha;
    if (uniao <= 0) return null;
    return (Math.max(0, r.areaNova_ha - r.acrescido_ha) / uniao) * 100;
  }, [alteracao]);

  const decidir = useCallback(
    async (status: ValidacaoStatus) => {
      if (!imovel) return;
      setSaving(true);
      try {
        await updateImovel(imovel.id, {
          validacao: { status, analista: 'Analista', updatedAt: Date.now() },
        });
        goBack();
      } finally {
        setSaving(false);
      }
    },
    [imovel, goBack],
  );

  if (loading) {
    return (
      <Screen title="Alteração de perímetro" subtitle="Carregando…">
        <View style={s.center}>
          <ActivityIndicator color={colors.verde} />
        </View>
      </Screen>
    );
  }

  if (!imovel || !alteracao) {
    return (
      <Screen title="Alteração de perímetro" subtitle={imovel?.imovel.nome ?? ''}>
        <View style={s.center}>
          <Text style={s.semAlt}>
            Sem alteração de perímetro detectada para este imóvel — não há registro anterior comparável.
          </Text>
        </View>
      </Screen>
    );
  }

  const r = alteracao.relatorio;
  const dec = decisaoSugerida(r.severidade);
  const anteriorCoords = alteracao.anteriorPoints.map(toLatLng);
  const novoCoords = imovel.geometry.points.map(toLatLng);
  const camadas: Sobreposicao[] = r.sobreposicoesAcrescido;
  const region = {
    latitude: imovel.geometry.points[0]!.latitude,
    longitude: imovel.geometry.points[0]!.longitude,
    latitudeDelta: 0.012,
    longitudeDelta: 0.012,
  };

  return (
    <Screen title="Alteração de perímetro" subtitle={imovel.imovel.nome || 'Imóvel sem nome'}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Mini-mapa antes × depois */}
        <MapView style={{ height: MAP_HEIGHT, borderRadius: 12 }} initialRegion={region} mapType="satellite">
          {anteriorCoords.length >= 3 && (
            <Polygon
              coordinates={anteriorCoords}
              strokeColor="#ffffff"
              fillColor="rgba(255,255,255,0.06)"
              strokeWidth={2}
              lineDashPattern={[8, 5]}
            />
          )}
          {novoCoords.length >= 3 && (
            <Polygon
              coordinates={novoCoords}
              strokeColor={colors.verde}
              fillColor="rgba(27,107,58,0.18)"
              strokeWidth={2}
            />
          )}
          {novoCoords.length > 1 && (
            <Polyline coordinates={novoCoords} strokeColor={colors.verdeClaro} strokeWidth={2} />
          )}
        </MapView>
        <View style={s.legendRow}>
          <Legend cor="#ffffff" dashed label={alteracao.baseline === 'real' ? 'Registro anterior' : 'Baseline (demo)'} />
          <Legend cor={colors.verde} label="Demarcação atual" />
        </View>

        {/* Banner de decisão sugerida */}
        <View style={[s.banner, { backgroundColor: toneBg[dec.tone], borderColor: toneColor[dec.tone] }]}>
          <Text style={[s.bannerTitulo, { color: toneColor[dec.tone] }]}>
            {dec.titulo}
          </Text>
          <Text style={s.bannerDetalhe}>{dec.detalhe}</Text>
          {dec.prazo && <Text style={[s.bannerPrazo, { color: toneColor[dec.tone] }]}>Prazo sugerido: {dec.prazo}</Text>}
          <Text style={s.bannerFonte}>Recomendação do algoritmo · severidade {r.severidade}</Text>
        </View>

        {/* ANTES × AGORA × DIFERENÇA */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Antes × Agora × Diferença</Text>
          <View style={s.tripleRow}>
            <Triple label="Antes" value={`${r.areaAnterior_ha.toFixed(2)} ha`} />
            <Triple label="Agora" value={`${r.areaNova_ha.toFixed(2)} ha`} />
            <Triple
              label="Diferença"
              value={`${r.delta_ha >= 0 ? '+' : ''}${r.delta_ha.toFixed(2)} ha`}
              sub={`${r.delta_pct >= 0 ? '+' : ''}${r.delta_pct.toFixed(1)}%`}
              highlight
            />
          </View>
          {concordancia != null && (
            <Text style={s.concordancia}>
              Concordância (IoU): <Text style={s.concordanciaVal}>{concordancia.toFixed(0)}%</Text>
              {'   ·   '}Tipo: {r.tipoAlteracao}
            </Text>
          )}
          {r.incertezaGPS_m != null && (
            <Text style={s.incerteza}>
              Incerteza GPS ~{r.incertezaGPS_m.toFixed(0)} m — variações menores que ~{(2 * r.incertezaGPS_m).toFixed(0)} m podem ser ruído.
            </Text>
          )}
        </View>

        {/* O que mudou — camadas tocadas pelo acréscimo */}
        <View style={s.card}>
          <Text style={s.cardTitle}>O que mudou no acréscimo</Text>
          {camadas.length > 0 ? (
            camadas.map((sb, i) => (
              <View key={i} style={s.camadaRow}>
                <Text style={s.camadaText}>
                  <Text style={{ fontWeight: '800' }}>{tipoLabel(sb.tipo)}</Text> — {sb.area_ha.toFixed(2)} ha ({sb.percentual.toFixed(1)}%) · {sb.severidade}
                </Text>
              </View>
            ))
          ) : (
            <Text style={s.semCamada}>✓ O acréscimo não toca TI/UC, embargo, desmate, queimada ou APP (demo).</Text>
          )}
        </View>

        {/* Recomendação */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Recomendação</Text>
          <Text style={s.recomendacao}>{r.recomendacao}</Text>
        </View>

        {/* Limites honestos */}
        <Text style={s.disclaimer}>
          {alteracao.baseline === 'demo'
            ? 'Comparação contra baseline de demonstração (sem registro anterior real). '
            : ''}
          Acréscimo não prova compra; sobreposição não prova invasão. Camadas offline — valide com dados oficiais (IBAMA/INCRA/FUNAI/ICMBio) quando houver rede.
        </Text>
      </ScrollView>

      {/* Ações de aceite do analista */}
      <View style={s.footer}>
        <View style={s.footerRow}>
          <SecondaryButton label="Reprovar" onPress={() => decidir('reprovado')} disabled={saving} />
          <View style={{ width: 8 }} />
          <SecondaryButton label="Agendar visita" onPress={() => decidir('pendente')} disabled={saving} />
          <View style={{ width: 8 }} />
          <PrimaryButton label="Aprovar" onPress={() => decidir('aprovado')} loading={saving} />
        </View>
      </View>
    </Screen>
  );
}

function Legend({ cor, label, dashed }: { cor: string; label: string; dashed?: boolean }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.swatch, { borderColor: cor, backgroundColor: dashed ? 'transparent' : `${cor}33` }, dashed && s.swatchDashed]} />
      <Text style={s.legendText}>{label}</Text>
    </View>
  );
}

function Triple({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <View style={s.triple}>
      <Text style={s.tripleLabel}>{label}</Text>
      <Text style={[s.tripleValue, highlight && { color: colors.verde }]}>{value}</Text>
      {sub && <Text style={s.tripleSub}>{sub}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  content: { padding: 14, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  semAlt: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },

  legendRow: { flexDirection: 'row', gap: 16, marginTop: 8, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 18, height: 12, borderWidth: 2, borderRadius: 2 },
  swatchDashed: { borderStyle: 'dashed' },
  legendText: { fontSize: 12, color: colors.muted, fontWeight: '600' },

  banner: { borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 10, marginBottom: 12 },
  bannerTitulo: { fontSize: 16, fontWeight: '800' },
  bannerDetalhe: { fontSize: 13, color: colors.ink, marginTop: 4, lineHeight: 18 },
  bannerPrazo: { fontSize: 13, fontWeight: '800', marginTop: 6 },
  bannerFonte: { fontSize: 11, color: colors.muted, marginTop: 6, fontStyle: 'italic' },

  card: { backgroundColor: colors.verdeBg, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: '800', color: colors.ink, marginBottom: 10 },

  tripleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  triple: { flex: 1, alignItems: 'center' },
  tripleLabel: { fontSize: 11, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' },
  tripleValue: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 3 },
  tripleSub: { fontSize: 11, color: colors.muted, marginTop: 1 },
  concordancia: { fontSize: 13, color: colors.ink, marginTop: 12 },
  concordanciaVal: { fontWeight: '800', color: colors.verde },
  incerteza: { fontSize: 11, color: colors.muted, marginTop: 6, fontStyle: 'italic', lineHeight: 15 },

  camadaRow: { marginBottom: 6 },
  camadaText: { fontSize: 13, color: colors.ink, lineHeight: 17 },
  semCamada: { fontSize: 13, color: colors.verde, fontWeight: '700' },

  recomendacao: { fontSize: 13, color: colors.ink, lineHeight: 19 },
  disclaimer: { fontSize: 10, color: colors.muted, fontStyle: 'italic', lineHeight: 14, marginTop: 2 },

  footer: { padding: 12, paddingBottom: 18, backgroundColor: colors.branco, borderTopWidth: 1, borderTopColor: colors.line },
  footerRow: { flexDirection: 'row', alignItems: 'center' },
});
