import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { getImovel, updateImovel } from '../lib/store';
import { deleteDocumentFile } from '../lib/documents';
import { Button, EmptyState } from '../ui';
import { colors } from '../theme/colors';
import type { Documento, Imovel } from '../types';
import {
  sincronizarDocumentos,
  listarDocumentosPropriedade,
  solicitacaoMetragem,
  CATALOGO_DIGITAL,
} from '../lib/docHub';
import type { ItemDocumento as ItemDocumentoModel, DocStatus } from '../lib/docHub';
import { abrirDocumentoDigital } from '../lib/docPdf';

const BADGE_LABEL: Record<DocStatus, string> = {
  'em-dia':   'Em dia',
  'vencendo': 'Vencendo',
  'vencido':  'Vencido',
  'pendente': 'Pendente',
  'ausente':  'Ausente',
};

type BadgeCores = { bg: string; text: string };
const BADGE_CORES: Record<DocStatus, BadgeCores> = {
  'em-dia':   { bg: colors.verdeBg, text: colors.primary },
  'vencendo': { bg: '#FFF7E6',      text: colors.aviso },
  'vencido':  { bg: '#FDECEC',      text: colors.critico },
  'pendente': { bg: '#FFF7E6',      text: colors.aviso },
  'ausente':  { bg: '#F5F5F5',      text: colors.mutedText },
};

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

function ehImagem(doc: Documento): boolean {
  if (doc.mime) return doc.mime.startsWith('image/');
  return /\.(jpg|jpeg|png|gif|webp|heic|bmp)$/i.test(doc.nome);
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// Linha de documento com status badge, ações Visualizar/Compartilhar e "Como obter".
function DocRow({
  item,
  onAbrir,
  onRemover,
}: {
  item: ItemDocumentoModel;
  onAbrir: (doc: Documento) => void;
  onRemover: (doc: Documento) => void;
}) {
  const cores = BADGE_CORES[item.status];

  return (
    <View style={s.itemDoc}>
      <View style={[s.thumb, s.thumbPdf]}>
        <Ionicons name="document-text-outline" size={22} color={colors.primary} />
      </View>
      <View style={s.itemInfo}>
        <View style={s.itemNomeRow}>
          <Text style={s.itemNome} numberOfLines={1}>{item.label}</Text>
          <View style={[s.badge, { backgroundColor: cores.bg }]}>
            <Text style={[s.badgeTxt, { color: cores.text }]}>{BADGE_LABEL[item.status]}</Text>
          </View>
        </View>
        {item.orgao ? <Text style={s.itemOrgao}>{item.orgao}</Text> : null}
        <Text style={s.itemDetalhe}>{item.detalhe}</Text>
        {item.doc ? (
          <View style={s.acoes}>
            <TouchableOpacity
              onPress={() => onAbrir(item.doc!)}
              style={s.btnAcao}
              accessibilityRole="button"
              accessibilityLabel={`Visualizar ${item.label}`}
            >
              <Text style={s.btnAcaoTxt}>Visualizar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onAbrir(item.doc!)}
              style={s.btnAcao}
              accessibilityRole="button"
              accessibilityLabel={`Compartilhar ${item.label}`}
            >
              <Text style={s.btnAcaoTxt}>Compartilhar</Text>
            </TouchableOpacity>
            {item.doc.origem === 'manual' ? (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    'Remover documento',
                    `Deseja remover "${item.label}"? Esta ação não pode ser desfeita.`,
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Remover', style: 'destructive', onPress: () => onRemover(item.doc!) },
                    ],
                  )
                }
                style={s.btnRemoverSmall}
                accessibilityRole="button"
                accessibilityLabel={`Remover ${item.label}`}
                hitSlop={8}
              >
                <Ionicons name="close" size={14} color={colors.critico} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                'Como obter',
                `${item.orgao}\n\n${item.detalhe}\n\nAcesse o app Meu Imóvel Rural (gov.br) para baixar seus documentos.`,
              )
            }
            style={s.btnComoObter}
            accessibilityRole="button"
            accessibilityLabel={`Como obter ${item.label}`}
          >
            <Text style={s.btnComoObterTxt}>Como obter</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// Linha simples para docs manuais de tipos não-digitais (foto, RG, etc.)
function ManualDocRow({
  doc,
  onRemover,
  onPress,
}: {
  doc: Documento;
  onRemover: (doc: Documento) => void;
  onPress: (doc: Documento) => void;
}) {
  const imagem = !!doc.uri && ehImagem(doc);
  const geotagged = doc.tipo === 'foto-divisa' && doc.lat != null && doc.lng != null;
  const label = CATALOGO_DIGITAL[doc.tipo]?.label ?? doc.nome;

  return (
    <View style={s.itemDoc}>
      <TouchableOpacity
        style={s.itemPressArea}
        onPress={() => onPress(doc)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Abrir ${label}`}
      >
        {imagem ? (
          <Image source={{ uri: doc.uri! }} style={s.thumb} resizeMode="cover" accessibilityLabel="" />
        ) : (
          <View style={[s.thumb, s.thumbPdf]}>
            <Ionicons
              name={geotagged ? 'location-outline' : 'document-text-outline'}
              size={24}
              color={geotagged ? colors.verdeClaro : colors.primary}
            />
          </View>
        )}
        <View style={s.itemInfo}>
          <Text style={s.itemNome} numberOfLines={1}>{label}</Text>
          {geotagged ? <Text style={s.itemGeo}>com localização</Text> : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={s.btnRemover}
        onPress={() =>
          Alert.alert('Remover documento', `Deseja remover "${label}"? Esta ação não pode ser desfeita.`, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Remover', style: 'destructive', onPress: () => onRemover(doc) },
          ])
        }
        accessibilityRole="button"
        accessibilityLabel={`Remover ${label}`}
        hitSlop={8}
      >
        <Ionicons name="close" size={16} color={colors.critico} />
      </TouchableOpacity>
    </View>
  );
}

export function DocumentosScreen({ imovelId }: { imovelId: string }) {
  const { navigate, goBack } = useNav();
  const [imovel, setImovel] = useState<Imovel | null>(null);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const sincronizar = useCallback(async (im: Imovel) => {
    setSincronizando(true);
    try {
      const docs = await sincronizarDocumentos(im);
      const atualizado = await updateImovel(im.id, {
        documentos: docs,
        documentosSincronizadosEm: Date.now(),
      });
      if (atualizado && montado.current) {
        setImovel(atualizado);
        setDocumentos(atualizado.documentos);
      }
    } finally {
      if (montado.current) setSincronizando(false);
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    getImovel(imovelId).then((im) => {
      if (!ativo) return;
      if (im) {
        setImovel(im);
        setDocumentos(im.documentos);
        if (!im.documentosSincronizadosEm) sincronizar(im);
      }
      setLoading(false);
    });
    return () => {
      ativo = false;
    };
  }, [imovelId, sincronizar]);

  async function salvarLista(nova: Documento[]): Promise<void> {
    setDocumentos(nova);
    await updateImovel(imovelId, { documentos: nova });
  }

  const removerDoc = useCallback(
    async (doc: Documento) => {
      await deleteDocumentFile(doc);
      await salvarLista(documentos.filter((d) => d.id !== doc.id));
    },
    [documentos], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function abrirDocumento(doc: Documento) {
    try {
      setBusy(true);
      await abrirDocumentoDigital(doc, imovel!);
    } catch {
      Alert.alert('Não foi possível abrir', 'Tente novamente em instantes.');
    } finally {
      setBusy(false);
    }
  }

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

  // ponytail: chamadas diretas (puras); useMemo aqui seria hook após early-return → Rules of Hooks
  const region = calcRegion(imovel.geometry.points);
  const itens = listarDocumentosPropriedade(imovel, Date.now());
  const solMetragem = solicitacaoMetragem(imovel);
  // docs de tipos não-digitais (foto-divisa, rg, outro) não cabem no catálogo →
  // exibidos em seção própria abaixo
  const outrosDocs = documentos.filter((d) => !CATALOGO_DIGITAL[d.tipo].digital);
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
          {imovel.geometry.area_ha === 0 ? (
            <Text style={s.metricaLabel}>Área ainda não medida</Text>
          ) : (
            <>
              <Text style={s.metricaLabel}>Área medida</Text>
              <Text style={s.metricaValor}>{imovel.geometry.area_ha.toFixed(2)} ha</Text>
            </>
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

        {/* 4. Lista de documentos do catálogo digital */}
        <Text style={s.secaoTitulo}>Seus documentos</Text>

        {sincronizando ? (
          <View style={s.busyRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={s.busyTexto}>Buscando seus documentos no gov.br…</Text>
          </View>
        ) : (
          <View style={s.listaDoc}>
            {itens.map((item) => (
              <DocRow
                key={item.tipo}
                item={item}
                onAbrir={abrirDocumento}
                onRemover={removerDoc}
              />
            ))}
          </View>
        )}

        {/* 4b. Fotos e outros (não-digitais) */}
        {outrosDocs.length > 0 ? (
          <>
            <Text style={s.secaoTituloSec}>Fotos e outros</Text>
            <View style={s.listaDoc}>
              {outrosDocs.map((doc) => (
                <ManualDocRow
                  key={doc.id}
                  doc={doc}
                  onRemover={removerDoc}
                  onPress={abrirDocumento}
                />
              ))}
            </View>
          </>
        ) : null}

        {busy ? (
          <View style={s.busyRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={s.busyTexto}>Aguarde…</Text>
          </View>
        ) : null}

        {/* 6. Link discreto de sync */}
        <TouchableOpacity
          onPress={() => sincronizar(imovel)}
          disabled={sincronizando}
          style={s.syncLink}
          accessibilityRole="button"
          accessibilityLabel="Atualizar documentos do gov.br"
          hitSlop={8}
        >
          {sincronizando ? (
            <View style={s.syncLinkRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={s.syncLinkTxt}>Atualizando…</Text>
            </View>
          ) : (
            <Text style={s.syncLinkTxt}>Atualizar documentos do gov.br</Text>
          )}
          {imovel.documentosSincronizadosEm ? (
            <Text style={s.syncLinkData}>
              Última atualização: {fmtDate(imovel.documentosSincronizadosEm)}
            </Text>
          ) : null}
        </TouchableOpacity>
      </ScrollView>

      {/* 7. Rodapé fixo */}
      <View style={s.rodape}>
        <Button label="Voltar" variant="secondary" onPress={goBack} />
        <View style={s.rodapeSpacer} />
        <Button
          label="Gerar Documento Final"
          variant="primary"
          onPress={() => navigate({ name: 'revisao', imovelId })}
        />
      </View>
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
  secaoTituloSec: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.mutedText,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 },
  busyTexto: { fontSize: 13, color: colors.mutedText },

  listaDoc: { gap: 8, marginBottom: 16 },

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
  itemPressArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.verdeBg },
  thumbPdf: { alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, gap: 4 },
  itemNomeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  itemNome: { fontSize: 14, fontWeight: '700', color: colors.inkText },
  itemOrgao: { fontSize: 12, color: colors.mutedText },
  itemGeo: { fontSize: 11, color: colors.verdeClaro },
  badgeGovBr: {
    backgroundColor: colors.verdeBg,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeGovBrTxt: { fontSize: 11, fontWeight: '700', color: colors.primary },

  // status badge (DocRow)
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeTxt: { fontSize: 11, fontWeight: '700' },

  itemDetalhe: { fontSize: 12, color: colors.mutedText, marginTop: 1 },

  acoes: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  btnAcao: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  btnAcaoTxt: { fontSize: 12, fontWeight: '600', color: colors.primary },

  btnRemoverSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fde8e8',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },

  btnComoObter: { marginTop: 6, alignSelf: 'flex-start' },
  btnComoObterTxt: { fontSize: 12, fontWeight: '600', color: colors.mutedText, textDecorationLine: 'underline' },

  btnRemover: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fde8e8',
    alignItems: 'center',
    justifyContent: 'center',
  },

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

  syncLink: { alignItems: 'center', paddingVertical: 12, marginBottom: 8 },
  syncLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  syncLinkTxt: { fontSize: 13, fontWeight: '600', color: colors.primary },
  syncLinkData: { fontSize: 11, color: colors.mutedText, marginTop: 3 },

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
