import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Polygon } from 'react-native-maps';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { getImovel } from '../lib/store';
import { exportPDF, exportGeoJSONFile, uploadPDFLink } from '../lib/export';
import { DocumentoPreviewModal } from '../ui/DocumentoPreviewModal';
import { mostrarLinkMedicao } from '../ui/linkMedicaoAlert';
import { Button, EmptyState } from '../ui';
import { colors } from '../theme/colors';
import type { Imovel } from '../types';
import { solicitacaoMetragem } from '../lib/docHub';
import { CHECKLIST_CAR_OFICIAL, type PassoCAR, type StatusPasso } from '../lib/checklistCAR';
import { solicitarVisitaTecnico } from '../lib/visita';

// chave da exportação em andamento
type Gerando = 'pdf-view' | 'pdf-share' | 'geojson' | 'pdf-link' | null;

function calcRegion(points: Array<{ latitude: number; longitude: number }>) {
  if (points.length < 3) return null;
  const lons = points.map((p) => p.longitude);
  const lats = points.map((p) => p.latitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(maxLat - minLat, 0.002) * 1.6,
    longitudeDelta: Math.max(maxLon - minLon, 0.002) * 1.6,
  };
}

interface Acao {
  label: string;
  carregando: boolean;
  onPress: () => void;
}

// Card de documento que o app GERA sob demanda (PDF/GeoJSON) — não fica armazenado.
function GeradoCard({
  icone,
  titulo,
  detalhe,
  acoes,
}: {
  icone: keyof typeof Ionicons.glyphMap;
  titulo: string;
  detalhe: string;
  acoes: Acao[];
}) {
  return (
    <View style={s.itemDoc}>
      <View style={[s.thumb, s.thumbPdf]}>
        <Ionicons name={icone} size={22} color={colors.primary} />
      </View>
      <View style={s.itemInfo}>
        <Text style={s.itemNome} numberOfLines={1}>{titulo}</Text>
        <Text style={s.itemDetalhe}>{detalhe}</Text>
        <View style={s.acoes}>
          {acoes.map((a) => (
            <TouchableOpacity
              key={a.label}
              onPress={a.onPress}
              disabled={a.carregando}
              style={[s.btnAcao, a.carregando && s.btnAcaoOff]}
              accessibilityRole="button"
              accessibilityLabel={`${a.label} — ${titulo}`}
            >
              {a.carregando ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={s.btnAcaoTxt}>{a.label}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

// Tag visual por status do passo.
const TAG: Record<StatusPasso, { texto: string; ok: boolean; cor: string }> = {
  'feito-app': { texto: 'Adiantado pela sua medição', ok: true, cor: colors.primary },
  'voce-ja-tem': { texto: 'Você já tem', ok: true, cor: colors.primary },
  'a-fazer': { texto: 'A fazer', ok: false, cor: colors.mutedText },
  'em-analise': { texto: 'Em análise', ok: false, cor: colors.aviso },
};

// Passo da checklist de emissão oficial do CAR. Toque abre "como obter" + órgão.
function PassoRow({
  passo,
  onSolicitarTecnico,
}: {
  passo: PassoCAR;
  onSolicitarTecnico?: () => void;
}) {
  const tag = TAG[passo.status];
  const feito = tag.ok;
  return (
    <TouchableOpacity
      style={s.passoRow}
      activeOpacity={0.7}
      onPress={() =>
        Alert.alert(
          passo.label,
          `Onde: ${passo.orgao}\n\n${passo.comoObter}${passo.nota ? `\n\n${passo.nota}` : ''}`,
        )
      }
      accessibilityRole="button"
      accessibilityLabel={`Como obter: ${passo.label}`}
    >
      <View style={[s.passoCheck, feito && s.passoCheckOk]}>
        <Ionicons
          name={feito ? 'checkmark' : 'ellipse-outline'}
          size={feito ? 16 : 13}
          color={feito ? colors.branco : colors.mutedText}
        />
      </View>
      <View style={s.itemInfo}>
        <Text style={s.passoLabel}>
          {passo.label}
          {!passo.obrigatorio ? <Text style={s.passoOpcional}>  · opcional</Text> : null}
        </Text>
        <Text style={s.passoOrgao}>{passo.orgao}</Text>
        <View style={[s.passoTag, { backgroundColor: `${tag.cor}1f` }]}>
          <Text style={[s.passoTagTxt, { color: tag.cor }]}>{tag.texto}</Text>
        </View>
        {passo.solicitarTecnico && onSolicitarTecnico ? (
          <TouchableOpacity
            onPress={onSolicitarTecnico}
            style={s.btnTecnico}
            accessibilityRole="button"
            accessibilityLabel="Solicitar técnico"
          >
            <Text style={s.btnTecnicoTxt}>Solicitar técnico</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
    </TouchableOpacity>
  );
}

export function DocumentosScreen({ imovelId }: { imovelId: string }) {
  const { navigate, goBack } = useNav();
  const [imovel, setImovel] = useState<Imovel | null>(null);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState<Gerando>(null);
  const [previewVisivel, setPreviewVisivel] = useState(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    let ativo = true;
    getImovel(imovelId).then((im) => {
      if (!ativo) return;
      if (im) setImovel(im);
      setLoading(false);
    });
    return () => {
      ativo = false;
    };
  }, [imovelId]);

  const exportar = useCallback(
    async (key: Exclude<Gerando, null>, fn: (im: Imovel) => Promise<void>) => {
      if (!imovel || gerando) return;
      setGerando(key);
      try {
        await fn(imovel);
      } catch (err: unknown) {
        Alert.alert('Ops', err instanceof Error ? err.message : 'Não foi possível gerar.');
      } finally {
        if (montado.current) setGerando(null);
      }
    },
    [imovel, gerando],
  );

  const gerarLink = useCallback(async () => {
    if (!imovel || gerando) return;
    setGerando('pdf-link');
    try {
      mostrarLinkMedicao(await uploadPDFLink(imovel));
    } catch (err: unknown) {
      Alert.alert('Ops', err instanceof Error ? err.message : 'Não foi possível gerar o link.');
    } finally {
      if (montado.current) setGerando(null);
    }
  }, [imovel, gerando]);

  if (loading) {
    return (
      <Screen title="Documentos" showBack>
        <View style={s.centralize}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </Screen>
    );
  }

  if (!imovel) {
    return (
      <Screen title="Documentos" showBack>
        <EmptyState title="Imóvel não encontrado" />
      </Screen>
    );
  }

  const region = calcRegion(imovel.geometry.points);
  const solMetragem = solicitacaoMetragem(imovel);
  const temMedicao = imovel.geometry.area_ha > 0;

  return (
    <Screen title={imovel.imovel.nome}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Linha de metragem */}
        <View style={s.metricaCard}>
          {temMedicao ? (
            <>
              <Text style={s.metricaLabel}>Área medida</Text>
              <Text style={s.metricaValor}>{imovel.geometry.area_ha.toFixed(2)} ha</Text>
            </>
          ) : (
            <Text style={s.metricaLabel}>Área ainda não medida</Text>
          )}
        </View>

        {/* 2. Mapa do perímetro */}
        {region ? (
          <View style={s.mapCard}>
            <Text style={s.mapLabel}>Perímetro do imóvel — SIRGAS 2000</Text>
            <MapView
              style={s.map}
              region={region}
              mapType="satellite"
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Polygon
                coordinates={imovel.geometry.points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }))}
                fillColor="rgba(45,90,39,0.3)"
                strokeColor={colors.primary}
                strokeWidth={2}
              />
            </MapView>
          </View>
        ) : null}

        {/* 3. Aviso: medição preliminar, não oficial */}
        {temMedicao ? (
          <View style={s.banner}>
            <Ionicons name="information-circle-outline" size={20} color={colors.aviso} />
            <View style={s.bannerInfo}>
              <Text style={s.bannerTitulo}>Medição preliminar (não oficial)</Text>
              <Text style={s.bannerDetalhe}>
                Feita pelo seu celular, serve como referência e adianta seu processo. Não
                substitui a medição oficial, que deve ser feita por um técnico habilitado em
                visita ao imóvel.
              </Text>
            </View>
          </View>
        ) : null}

        {/* 3b. Card "Nova metragem" */}
        {solMetragem ? (
          <View style={s.cardMetragem}>
            <Ionicons name="warning-outline" size={20} color={colors.aviso} />
            <View style={s.cardMetragemInfo}>
              <Text style={s.cardMetragemTitulo}>Nova metragem detectada</Text>
              <Text style={s.cardMetragemMsg}>{solMetragem.mensagem}</Text>
            </View>
          </View>
        ) : null}

        {/* 4. Documentos gerados em campo (só o que o app produz de verdade) */}
        <Text style={s.secaoTitulo}>Documentos gerados em campo</Text>

        {temMedicao ? (
          <View style={s.listaDoc}>
            <GeradoCard
              icone="document-text-outline"
              titulo="Medição preliminar (PDF)"
              detalhe="Croqui, medidas e vértices GPS para guardar e levar à visita."
              acoes={[
                {
                  label: 'Visualizar',
                  carregando: false,
                  onPress: () => setPreviewVisivel(true),
                },
                {
                  label: 'Baixar / Enviar',
                  carregando: gerando === 'pdf-share',
                  onPress: () => exportar('pdf-share', exportPDF),
                },
                {
                  label: 'Gerar link',
                  carregando: gerando === 'pdf-link',
                  onPress: gerarLink,
                },
              ]}
            />
            <GeradoCard
              icone="map-outline"
              titulo="GeoJSON do perímetro"
              detalhe="Geometria padrão (RFC 7946) para enviar à CAR Geo API ou abrir em GIS."
              acoes={[
                {
                  label: 'Baixar / Enviar',
                  carregando: gerando === 'geojson',
                  onPress: () => exportar('geojson', exportGeoJSONFile),
                },
              ]}
            />
          </View>
        ) : (
          <EmptyState
            title="Meça o imóvel para gerar seus documentos"
            hint="Caminhe a divisa na etapa de demarcação. Depois você gera aqui o PDF de medição e o GeoJSON do perímetro."
          />
        )}

        {/* 5. Checklist: próximos passos para a emissão oficial do CAR */}
        <Text style={s.secaoTitulo}>Para a emissão oficial do CAR</Text>
        <Text style={s.secaoSub}>
          O que ainda falta para registrar oficialmente. Toque em cada item para ver onde
          obter.
        </Text>
        <View style={s.listaPasso}>
          {CHECKLIST_CAR_OFICIAL.map((passo) => (
            <PassoRow
              key={passo.id}
              passo={passo}
              onSolicitarTecnico={
                passo.solicitarTecnico && temMedicao
                  ? () =>
                      Alert.alert(
                        'Solicitar técnico',
                        'Pedir a visita de um técnico para a medição oficial?',
                        [
                          {
                            text: 'Solicitar',
                            onPress: async () => {
                              await solicitarVisitaTecnico(
                                imovel,
                                'medicao',
                                'Solicitação de técnico para medição oficial (checklist CAR).',
                              );
                              Alert.alert('Pronto', 'Sua solicitação foi registrada.');
                            },
                          },
                          { text: 'Cancelar', style: 'cancel' },
                        ],
                      )
                  : undefined
              }
            />
          ))}
        </View>
      </ScrollView>

      {/* 5. Rodapé fixo */}
      <View style={s.rodape}>
        <Button label="Voltar" variant="secondary" onPress={goBack} />
        <View style={s.rodapeSpacer} />
        <Button
          label="Gerar Documento Final"
          variant="primary"
          onPress={() => navigate({ name: 'revisao', imovelId })}
        />
      </View>

      <DocumentoPreviewModal
        imovel={imovel}
        visible={previewVisivel}
        onClose={() => setPreviewVisivel(false)}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  centralize: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 8 },

  metricaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.verdeBg,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 12,
  },
  metricaLabel: { fontSize: 13, fontWeight: '600', color: colors.mutedText },
  metricaValor: { fontSize: 22, fontWeight: '800', color: colors.inkText },

  mapCard: { marginBottom: 12 },
  mapLabel: { fontSize: 11, fontWeight: '700', color: colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  map: { height: 180, borderRadius: 12, overflow: 'hidden' },

  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFF7E6',
    borderLeftWidth: 4,
    borderLeftColor: colors.aviso,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  bannerInfo: { flex: 1, gap: 4 },
  bannerTitulo: { fontSize: 13, fontWeight: '700', color: colors.aviso },
  bannerDetalhe: { fontSize: 12, color: colors.inkText, lineHeight: 18 },

  secaoTitulo: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.inkText,
    marginTop: 20,
    marginBottom: 12,
  },

  secaoSub: { fontSize: 12, color: colors.mutedText, lineHeight: 17, marginTop: -6, marginBottom: 10 },

  listaDoc: { gap: 8, marginBottom: 16 },
  listaPasso: { gap: 8, marginBottom: 8 },

  passoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.branco,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 10,
  },
  passoCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.verdeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passoCheckOk: { backgroundColor: colors.primary },
  passoLabel: { fontSize: 14, fontWeight: '700', color: colors.inkText },
  passoOpcional: { fontSize: 12, fontWeight: '600', color: colors.mutedText },
  passoOrgao: { fontSize: 12, color: colors.mutedText, marginTop: 2 },
  passoTag: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  passoTagTxt: { fontSize: 11, fontWeight: '700' },
  btnTecnico: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  btnTecnicoTxt: { fontSize: 12, fontWeight: '600', color: colors.primary },

  itemDoc: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.branco,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 10,
    minHeight: 72,
  },
  thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.verdeBg },
  thumbPdf: { alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, gap: 4 },
  itemNome: { fontSize: 14, fontWeight: '700', color: colors.inkText },
  itemDetalhe: { fontSize: 12, color: colors.mutedText, marginTop: 1 },

  acoes: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  btnAcao: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    minWidth: 72,
    alignItems: 'center',
  },
  btnAcaoOff: { opacity: 0.5 },
  btnAcaoTxt: { fontSize: 12, fontWeight: '600', color: colors.primary },

  cardMetragem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFF7E6',
    borderLeftWidth: 4,
    borderLeftColor: colors.aviso,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  cardMetragemInfo: { flex: 1, gap: 4 },
  cardMetragemTitulo: { fontSize: 13, fontWeight: '700', color: colors.aviso },
  cardMetragemMsg: { fontSize: 12, color: colors.inkText, lineHeight: 18 },

  rodape: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.branco,
  },
  rodapeSpacer: { width: 10 },
});
