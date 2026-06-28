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
import { deleteDocumentFile, pickDocument, pickFromLibrary, takePhoto } from '../lib/documents';
import { Button, EmptyState } from '../ui';
import { colors } from '../theme/colors';
import type { Documento, DocumentoTipo, Imovel } from '../types';
import { sincronizarDocumentos, avaliarRegularidade, CATALOGO_DIGITAL } from '../lib/docHub';

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

// ponytail: label e orgao vêm do CATALOGO_DIGITAL; aqui só acoes e geotag
type TipoMeta = {
  acoes: ('camera' | 'galeria' | 'arquivo')[];
  geotag?: boolean;
};

const TIPOS_META: Record<DocumentoTipo, TipoMeta> = {
  car:          { acoes: ['arquivo', 'galeria', 'camera'] },
  'car-extrato':{ acoes: ['arquivo', 'galeria'] },
  ccir:         { acoes: ['arquivo', 'galeria', 'camera'] },
  sigef:        { acoes: ['arquivo', 'galeria'] },
  matricula:    { acoes: ['arquivo', 'galeria', 'camera'] },
  caf:          { acoes: ['arquivo', 'galeria'] },
  itr:          { acoes: ['arquivo', 'galeria'] },
  licenca:      { acoes: ['arquivo', 'galeria', 'camera'] },
  rg:           { acoes: ['camera', 'galeria', 'arquivo'] },
  'foto-divisa':{ acoes: ['camera', 'galeria'], geotag: true },
  outro:        { acoes: ['camera', 'galeria', 'arquivo'] },
};

const ORDEM_TIPOS: DocumentoTipo[] = [
  'car', 'car-extrato', 'ccir', 'sigef', 'matricula',
  'caf', 'itr', 'licenca', 'rg', 'foto-divisa', 'outro',
];

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

function ItemDocumento({
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
  const label = CATALOGO_DIGITAL[doc.tipo].label;

  function confirmarRemocao() {
    const msg =
      doc.origem === 'govbr'
        ? `Deseja remover "${label}" da lista? Pode restaurar em "Atualizar documentos do gov.br".`
        : `Deseja remover "${label}"? Esta ação não pode ser desfeita.`;
    Alert.alert('Remover documento', msg, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => onRemover(doc) },
    ]);
  }

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
          <Image
            source={{ uri: doc.uri! }}
            style={s.thumb}
            resizeMode="cover"
            accessibilityLabel=""
          />
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
          <View style={s.itemNomeRow}>
            <Text style={s.itemNome} numberOfLines={1}>
              {label}
            </Text>
            {doc.origem === 'govbr' ? (
              <View style={s.badgeGovBr}>
                <Text style={s.badgeGovBrTxt}>gov.br</Text>
              </View>
            ) : null}
          </View>
          {doc.origem === 'govbr' && doc.orgao ? (
            <Text style={s.itemOrgao}>{doc.orgao}</Text>
          ) : null}
          {geotagged ? <Text style={s.itemGeo}>com localização</Text> : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={s.btnRemover}
        onPress={confirmarRemocao}
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

  const adicionarDoc = useCallback(
    async (doc: Documento) => {
      await salvarLista([...documentos, doc]);
    },
    [documentos], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const removerDoc = useCallback(
    async (doc: Documento) => {
      await deleteDocumentFile(doc);
      await salvarLista(documentos.filter((d) => d.id !== doc.id));
    },
    [documentos], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function comCamera(tipo: DocumentoTipo, geotag: boolean) {
    setBusy(true);
    try {
      const doc = await takePhoto(tipo, { geotag });
      if (doc) await adicionarDoc(doc);
    } finally {
      setBusy(false);
    }
  }

  async function comGaleria(tipo: DocumentoTipo) {
    setBusy(true);
    try {
      const doc = await pickFromLibrary(tipo);
      if (doc) await adicionarDoc(doc);
    } finally {
      setBusy(false);
    }
  }

  async function comArquivo(tipo: DocumentoTipo) {
    setBusy(true);
    try {
      const doc = await pickDocument(tipo);
      if (doc) await adicionarDoc(doc);
    } finally {
      setBusy(false);
    }
  }

  function abrirMenu(tipo: DocumentoTipo) {
    if (busy) return;
    const meta = TIPOS_META[tipo];
    const botoes: { text: string; onPress: () => void }[] = [];
    if (meta.acoes.includes('camera')) {
      const rotulo = meta.geotag ? 'Tirar foto (com localização)' : 'Tirar foto';
      botoes.push({ text: rotulo, onPress: () => comCamera(tipo, !!meta.geotag) });
    }
    if (meta.acoes.includes('galeria')) {
      botoes.push({ text: 'Escolher da galeria', onPress: () => comGaleria(tipo) });
    }
    if (meta.acoes.includes('arquivo')) {
      botoes.push({ text: 'Escolher arquivo (PDF)', onPress: () => comArquivo(tipo) });
    }
    Alert.alert('Como vai adicionar?', undefined, [
      ...botoes.map((b) => ({ text: b.text, onPress: b.onPress })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  }

  function abrirSeletor() {
    if (busy) return;
    Alert.alert('Que documento é esse?', undefined, [
      ...ORDEM_TIPOS.map((tipo) => ({
        text: CATALOGO_DIGITAL[tipo].label,
        onPress: () => abrirMenu(tipo),
      })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  }

  function abrirDocumento(doc: Documento) {
    if (doc.origem === 'govbr' || !doc.uri) {
      Alert.alert(
        CATALOGO_DIGITAL[doc.tipo].label,
        'Documento sincronizado do gov.br. Visualização completa disponível na versão integrada (demo).',
      );
      return;
    }
    // ponytail: sem file-viewer; abrir quando expo-file-viewer disponível
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

  // ponytail: chamada direta (pura); useMemo aqui seria hook após early-return → Rules of Hooks
  const reg = avaliarRegularidade(imovel);
  const region = calcRegion(imovel.geometry.points);

  // govbr primeiro (ordem do catálogo), manuais por createdAt desc
  const docsOrdenados = [
    ...documentos
      .filter((d) => d.origem === 'govbr')
      .sort((a, b) => ORDEM_TIPOS.indexOf(a.tipo) - ORDEM_TIPOS.indexOf(b.tipo)),
    ...documentos
      .filter((d) => d.origem !== 'govbr')
      .sort((a, b) => b.createdAt - a.createdAt),
  ];

  const bannerTitulo =
    reg.nivel === 'critico'
      ? 'Regularização crítica — acesso a crédito bloqueado.'
      : 'Documentos faltando podem impedir crédito rural.';
  const bannerDetalhe =
    reg.docsObrigatoriosFaltando.length > 0
      ? `Falta: ${reg.docsObrigatoriosFaltando.map((t) => CATALOGO_DIGITAL[t].label).join(', ')}`
      : reg.haEmRisco > 0
        ? `~${reg.haEmRisco.toFixed(1)} ha não regularizados.`
        : null;

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

        {/* 3. Banner de regularidade (só se impacta crédito) */}
        {reg.podeImpactarCredito ? (
          <View style={[s.banner, reg.nivel === 'critico' ? s.bannerCritico : s.bannerPendente]}>
            <Text style={s.bannerTitulo}>{bannerTitulo}</Text>
            {bannerDetalhe ? <Text style={s.bannerDetalhe}>{bannerDetalhe}</Text> : null}
          </View>
        ) : null}

        {/* 4. Lista de documentos */}
        <Text style={s.secaoTitulo}>Seus documentos</Text>

        {sincronizando ? (
          <View style={s.busyRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={s.busyTexto}>Buscando seus documentos no gov.br…</Text>
          </View>
        ) : docsOrdenados.length === 0 ? (
          <EmptyState
            title="Nenhum documento ainda"
            hint="Adicione a matrícula, a foto da divisa ou o CCIR para ter tudo num lugar só."
          />
        ) : (
          <View style={s.listaDoc}>
            {docsOrdenados.map((doc) => (
              <ItemDocumento
                key={doc.id}
                doc={doc}
                onRemover={removerDoc}
                onPress={abrirDocumento}
              />
            ))}
          </View>
        )}

        {/* 5. Botão "+ Adicionar documento" */}
        <Button
          label="Adicionar documento"
          variant="outlined"
          onPress={abrirSeletor}
          disabled={busy || sincronizando}
          style={s.btnAdicionar}
        />
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
          label="Ir para Revisão"
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
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    gap: 4,
  },
  bannerPendente: { backgroundColor: '#FFF7E6', borderLeftColor: colors.aviso },
  bannerCritico:  { backgroundColor: '#FDECEC', borderLeftColor: colors.critico },
  bannerTitulo: { fontSize: 13, fontWeight: '700', color: colors.inkText },
  bannerDetalhe: { fontSize: 12, color: colors.mutedText },

  secaoTitulo: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.inkText,
    marginTop: 20,
    marginBottom: 12,
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

  btnRemover: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fde8e8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  btnAdicionar: { marginTop: 4, marginBottom: 16 },

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
