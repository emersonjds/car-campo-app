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
import MapView, { Polygon } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { getImovel, updateImovel } from '../lib/store';
import { deleteDocumentFile, pickDocument, pickFromLibrary, takePhoto } from '../lib/documents';
import { exportPDF, shareText } from '../lib/export';
import { Button, Card, EmptyState, StatusChip } from '../ui';
import { colors } from '../theme/colors';
import type { Documento, DocumentoTipo, Imovel } from '../types';
import { sincronizarDocumentos, avaliarRegularidade, CATALOGO_DIGITAL } from '../lib/docHub';

type Tab = 'dados' | 'dominio' | 'uso';
type ChecklistStatus = 'ok' | 'aviso' | 'pendente';

interface ChecklistEntry {
  label: string;
  detail?: string;
  status: ChecklistStatus;
}

function chipProps(imovel: Imovel): { status: 'regularizado' | 'critico' | 'aviso'; label: string } {
  const v = imovel.validacao?.status;
  if (v === 'aprovado') return { status: 'regularizado', label: 'Validado' };
  if (v === 'reprovado') return { status: 'critico', label: 'Reprovado' };
  return { status: 'aviso', label: 'Pendente' };
}

function buildChecklist(imovel: Imovel): ChecklistEntry[] {
  const ok = imovel.validacao?.status === 'aprovado';
  const entries: ChecklistEntry[] = [
    {
      label: 'Reserva Legal averbada',
      detail: 'Conforme Art. 12 da Lei 12.651',
      status: ok ? 'ok' : 'pendente',
    },
    {
      label: 'APP em conformidade',
      detail: 'Área de Preservação Permanente',
      status: ok ? 'ok' : 'pendente',
    },
    {
      label: 'Georreferenciamento',
      detail: imovel.status === 'enviado' ? 'Enviado ao SICAR' : 'Pendente de envio',
      status: imovel.status === 'enviado' ? 'ok' : 'pendente',
    },
  ];
  if (imovel.alertaDivergencia) {
    const pct = imovel.alertaDivergencia.delta_pct.toFixed(2);
    entries.push({
      label: 'Sobreposição Parcial',
      detail: `Aguardando análise (${pct}%)`,
      status: 'aviso',
    });
  }
  return entries;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

function MetricCard({
  label,
  value,
  sublabel,
  valueColor,
}: {
  label: string;
  value: string;
  sublabel?: string;
  valueColor?: string;
}) {
  return (
    <View style={s.metricCard}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={[s.metricValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
      {sublabel ? <Text style={s.metricSub}>{sublabel}</Text> : null}
    </View>
  );
}

function ChecklistRow({ item }: { item: ChecklistEntry }) {
  const iconName =
    item.status === 'ok'
      ? ('checkmark-circle' as const)
      : item.status === 'aviso'
        ? ('warning' as const)
        : ('time-outline' as const);
  const iconColor =
    item.status === 'ok' ? colors.primary : item.status === 'aviso' ? colors.aviso : colors.mutedText;
  return (
    <View style={s.checkRow}>
      <Ionicons name={iconName} size={20} color={iconColor} />
      <View style={s.checkBody}>
        <Text style={[s.checkLabel, item.status === 'aviso' && { color: colors.critico }]}>
          {item.label}
        </Text>
        {item.detail ? <Text style={s.checkDetail}>{item.detail}</Text> : null}
      </View>
    </View>
  );
}

function TabDados({ imovel }: { imovel: Imovel }) {
  const region = calcRegion(imovel.geometry.points);
  return (
    <View style={s.tabContent}>
      <InfoRow label="Nome da Propriedade" value={imovel.imovel.nome} />
      <InfoRow
        label="Município"
        value={[imovel.imovel.municipio, imovel.imovel.uf].filter(Boolean).join(' – ')}
      />
      {imovel.imovel.modulosFiscais != null && (
        <InfoRow label="Módulos Fiscais" value={`${imovel.imovel.modulosFiscais} módulos`} />
      )}
      <InfoRow label="Proprietário Principal" value={imovel.produtor.nome} />

      {region ? (
        <>
          <Text style={s.mapLabel}>Coordenadas SIRGAS 2000</Text>
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
              coordinates={imovel.geometry.points.map((p) => ({
                latitude: p.latitude,
                longitude: p.longitude,
              }))}
              fillColor="rgba(45,90,39,0.3)"
              strokeColor={colors.primary}
              strokeWidth={2}
            />
          </MapView>
        </>
      ) : (
        <Text style={s.tabEmpty}>Nenhum perímetro demarcado.</Text>
      )}
    </View>
  );
}

function TabDominio({ imovel }: { imovel: Imovel }) {
  const docsDom = imovel.documentos.filter(
    (d) => d.tipo === 'matricula' || d.tipo === 'ccir',
  );
  return (
    <View style={s.tabContent}>
      {imovel.imovel.matricula ? (
        <InfoRow label="Matrícula" value={imovel.imovel.matricula} />
      ) : null}
      {docsDom.length > 0 ? (
        docsDom.map((doc) => (
          <View key={doc.id} style={s.domDocRow}>
            <Ionicons name="document-outline" size={18} color={colors.mutedText} />
            <Text style={s.domDocLabel} numberOfLines={1}>
              {doc.nome}
            </Text>
          </View>
        ))
      ) : (
        <Text style={s.tabEmpty}>
          {imovel.imovel.matricula
            ? 'Nenhum documento de matrícula ou CCIR anexado.'
            : 'Matrícula e CCIR não informados.'}
        </Text>
      )}
    </View>
  );
}

function TabUso() {
  return (
    <View style={s.tabContent}>
      <Text style={s.tabEmpty}>Uso do solo não cadastrado neste imóvel.</Text>
    </View>
  );
}

type TipoMeta = {
  label: string;
  descricao: string;
  icone: string;
  acoes: ('camera' | 'galeria' | 'arquivo')[];
  geotag?: boolean;
  /** Onde o produtor baixa este documento em formato DIGITAL (PDF). */
  origem?: string;
};

// Vários documentos do imóvel rural já existem em formato digital e o próprio
// produtor pode baixá-los (gov.br/Meu Imóvel Rural, INCRA, SIGEF, MDA, Receita).
// `origem` mostra onde obter o PDF — é só importar pelo seletor de arquivos.
const TIPOS_META: Record<DocumentoTipo, TipoMeta> = {
  car: {
    label: 'Recibo do CAR',
    descricao: 'Recibo de inscrição no Cadastro Ambiental Rural (PDF)',
    icone: '📋',
    acoes: ['arquivo', 'galeria', 'camera'],
    origem: 'gov.br › Meu Imóvel Rural (SICAR)',
  },
  'car-extrato': {
    label: 'Extrato do CAR',
    descricao: 'Demonstrativo da situação do imóvel no CAR (PDF)',
    icone: '🌿',
    acoes: ['arquivo', 'galeria'],
    origem: 'gov.br › Meu Imóvel Rural (SICAR)',
  },
  ccir: {
    label: 'CCIR',
    descricao: 'Certificado de Cadastro de Imóvel Rural (PDF)',
    icone: '🧾',
    acoes: ['arquivo', 'galeria', 'camera'],
    origem: 'gov.br › Emitir CCIR (INCRA)',
  },
  sigef: {
    label: 'Georreferenciamento',
    descricao: 'Certidão de demarcação georreferenciada (planta e memorial)',
    icone: '📐',
    acoes: ['arquivo', 'galeria'],
    origem: 'sigef.incra.gov.br',
  },
  matricula: {
    label: 'Matrícula',
    descricao: 'Matrícula ou escritura do imóvel',
    icone: '📄',
    acoes: ['arquivo', 'galeria', 'camera'],
    origem: 'Cartório de Registro de Imóveis (matrícula eletrônica)',
  },
  caf: {
    label: 'CAF',
    descricao: 'Cadastro da Agricultura Familiar — substitui a DAP (Pronaf)',
    icone: '👩‍🌾',
    acoes: ['arquivo', 'galeria'],
    origem: 'caf.mda.gov.br',
  },
  itr: {
    label: 'ITR / CAFIR',
    descricao: 'Comprovante do Imposto Territorial Rural / cadastro CAFIR',
    icone: '🧮',
    acoes: ['arquivo', 'galeria'],
    origem: 'gov.br › Receita Federal',
  },
  licenca: {
    label: 'Licença ambiental',
    descricao: 'Licença (LP/LI/LO) ou outorga de uso de água',
    icone: '✅',
    acoes: ['arquivo', 'galeria', 'camera'],
    origem: 'Órgão ambiental estadual (SEMA / IAT / INEA…)',
  },
  rg: {
    label: 'RG / CPF',
    descricao: 'Documento de identidade do produtor',
    icone: '🪪',
    acoes: ['camera', 'galeria', 'arquivo'],
  },
  'foto-divisa': {
    label: 'Foto da divisa',
    descricao: 'Foto do limite do imóvel (com localização)',
    icone: '📷',
    acoes: ['camera', 'galeria'],
    geotag: true,
  },
  outro: {
    label: 'Outro documento',
    descricao: 'Qualquer outro anexo relevante',
    icone: '📎',
    acoes: ['camera', 'galeria', 'arquivo'],
  },
};

const ORDEM_TIPOS: DocumentoTipo[] = [
  'car',
  'car-extrato',
  'ccir',
  'sigef',
  'matricula',
  'caf',
  'itr',
  'licenca',
  'rg',
  'foto-divisa',
  'outro',
];

function BotaoTipo({
  meta,
  onPress,
  disabled,
}: {
  meta: TipoMeta;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.tipoBtn, disabled && s.tipoBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Adicionar ${meta.label}: ${meta.descricao}`}
    >
      <Text style={s.tipoBtnIcone}>{meta.icone}</Text>
      <Text style={s.tipoBtnLabel}>{meta.label}</Text>
      <Text style={s.tipoBtnDesc} numberOfLines={2}>
        {meta.descricao}
      </Text>
      {meta.origem ? (
        <Text style={s.tipoBtnOrigem} numberOfLines={2}>
          📲 Baixe digital: {meta.origem}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
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
  // ponytail: guard uri — docs govbr não têm arquivo local
  const imagem = !!doc.uri && ehImagem(doc);
  const meta = TIPOS_META[doc.tipo];
  const geotagged = doc.tipo === 'foto-divisa' && doc.lat != null && doc.lng != null;

  function confirmarRemocao() {
    const msg = doc.origem === 'govbr'
      ? `Deseja remover "${doc.nome}" da lista? Ele pode ser restaurado em "Sincronizar com gov.br".`
      : `Deseja remover "${doc.nome}"? Esta ação não pode ser desfeita.`;
    Alert.alert(
      'Remover documento',
      msg,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => onRemover(doc) },
      ],
    );
  }

  return (
    <View style={s.itemDoc}>
      <TouchableOpacity
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
        onPress={() => onPress(doc)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Abrir ${doc.nome}, tipo ${meta?.label ?? doc.tipo}`}
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
            <Text style={s.thumbPdfIcone}>📄</Text>
          </View>
        )}
        <View style={s.itemInfo}>
          <Text style={s.itemNome} numberOfLines={1}>
            {doc.nome}
          </Text>
          <Text style={s.itemTipo}>{meta?.label ?? doc.tipo}</Text>
          {geotagged ? <Text style={s.itemGeo}>georreferenciada</Text> : null}
          {doc.origem === 'govbr' ? (
            <Text style={s.docOrigem}>🔗 gov.br · {doc.orgao}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={s.btnRemover}
        onPress={confirmarRemocao}
        accessibilityRole="button"
        accessibilityLabel={`Remover ${doc.nome}`}
        hitSlop={8}
      >
        <Text style={s.btnRemoverTexto}>✕</Text>
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
  const [sharingPdf, setSharingPdf] = useState(false);
  const [sharingText, setSharingText] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('dados');
  const [sincronizando, setSincronizando] = useState(false);
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

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
    const msg = meta.origem
      ? `${meta.descricao}\n\n📲 Você pode baixar este documento em PDF: ${meta.origem}. Depois é só importar pelo arquivo.`
      : meta.descricao;
    Alert.alert(meta.label, msg, [
      ...botoes.map((b) => ({ text: b.text, onPress: b.onPress })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  }

  async function handlePdf() {
    if (!imovel) return;
    setSharingPdf(true);
    try {
      await exportPDF(imovel);
    } catch {
      Alert.alert('Erro', 'Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setSharingPdf(false);
    }
  }

  async function handleShare() {
    if (!imovel) return;
    setSharingText(true);
    try {
      await shareText(imovel);
    } catch {
      Alert.alert('Erro', 'Não foi possível compartilhar.');
    } finally {
      setSharingText(false);
    }
  }

  function abrirDocumento(doc: Documento) {
    if (doc.origem === 'govbr' || !doc.uri) {
      Alert.alert(
        doc.nome,
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

  const { status: chipStatus, label: chipLabel } = chipProps(imovel);
  const checklist = buildChecklist(imovel);
  // ponytail: chamada direta (pura, O(docs)); useMemo aqui seria hook após early-return → Rules of Hooks
  const reg = avaliarRegularidade(imovel);
  const firstImageDoc = documentos.find((d) => !!d.uri && ehImagem(d));
  const areaStr = `${imovel.geometry.area_ha.toFixed(2)} ha`;
  const protoco = imovel.imovel.matricula
    ? `Matrícula: ${imovel.imovel.matricula}`
    : `ID: ${imovel.id.slice(0, 12)}`;
  const tabs: { key: Tab; label: string }[] = [
    { key: 'dados', label: 'Dados do Imóvel' },
    { key: 'dominio', label: 'Domínio' },
    { key: 'uso', label: 'Uso do Solo' },
  ];

  return (
    <Screen title="Documentos" subtitle={imovel.imovel.nome}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.breadcrumb}>Documentos › CAR</Text>
        <View style={s.titleRow}>
          <Text style={s.titleCar} numberOfLines={2}>
            Cadastro Ambiental Rural (CAR)
          </Text>
          <StatusChip status={chipStatus} label={chipLabel} />
        </View>
        <Text style={s.protoco}>{protoco}</Text>

        <View style={s.actionRow}>
          <Button
            label="Compartilhar"
            variant="outlined"
            onPress={handleShare}
            loading={sharingText}
            disabled={sharingPdf}
          />
          <View style={s.actionSpacer} />
          <Button
            label="Baixar PDF"
            variant="primary"
            onPress={handlePdf}
            loading={sharingPdf}
            disabled={sharingText}
          />
        </View>

        <Card style={s.secaoCard}>
          <Text style={s.secaoLabel}>VISUALIZAÇÃO</Text>
          {firstImageDoc ? (
            <Image
              source={{ uri: firstImageDoc.uri! }}
              style={s.preview}
              resizeMode="contain"
              accessibilityLabel="Pré-visualização do documento"
            />
          ) : (
            <View style={s.previewPlaceholder}>
              <Ionicons name="document-text-outline" size={40} color={colors.mutedText} />
              <Text style={s.previewPlaceholderText}>
                {documentos.length > 0
                  ? 'Pré-visualização não disponível (PDF)'
                  : 'Nenhum documento anexado'}
              </Text>
            </View>
          )}
          <Text style={s.previewMeta}>
            {documentos.length}{' '}
            {documentos.length !== 1 ? 'documentos' : 'documento'} · Atualizado em{' '}
            {fmtDate(imovel.updatedAt)}
          </Text>
        </Card>

        <Card style={s.secaoCard}>
          <Text style={s.secaoLabel}>HISTÓRICO DE VERSÕES</Text>
          {imovel.updatedAt !== imovel.createdAt && (
            <View style={s.historicoItem}>
              <View style={[s.historicoDot, { backgroundColor: colors.primary }]} />
              <View>
                <Text style={s.historicoLbl}>Atualização</Text>
                <Text style={s.historicoData}>{fmtDate(imovel.updatedAt)}</Text>
              </View>
            </View>
          )}
          <View style={s.historicoItem}>
            <View style={[s.historicoDot, { backgroundColor: colors.line }]} />
            <View>
              <Text style={s.historicoLbl}>Cadastro inicial</Text>
              <Text style={s.historicoData}>{fmtDate(imovel.createdAt)}</Text>
            </View>
          </View>
        </Card>

        <View style={s.metricsRow}>
          <MetricCard label="Área Total" value={areaStr} />
          <View style={s.metricSpacer} />
          <MetricCard
            label="Reserva Legal"
            value="—"
            sublabel="Pendente"
            valueColor={colors.secondary}
          />
        </View>
        <MetricCard
          label="APP"
          value="—"
          sublabel="Pendente"
          valueColor={colors.tertiary}
        />

        <View style={s.tabBar}>
          {tabs.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[s.tab, activeTab === key && s.tabActive]}
              onPress={() => setActiveTab(key)}
              accessibilityRole="tab"
            >
              <Text style={[s.tabLabelText, activeTab === key && s.tabLabelActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Card style={s.tabCard}>
          {activeTab === 'dados' && <TabDados imovel={imovel} />}
          {activeTab === 'dominio' && <TabDominio imovel={imovel} />}
          {activeTab === 'uso' && <TabUso />}
        </Card>

        <Card style={s.secaoCard}>
          <Text style={s.secaoLabel}>CHECKLIST DE CONFORMIDADE</Text>
          {checklist.map((item, i) => (
            <ChecklistRow key={i} item={item} />
          ))}
        </Card>

        {sincronizando ? (
          <View style={s.busyRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={s.busyTexto}>Buscando seus documentos no gov.br…</Text>
          </View>
        ) : null}

        {reg.podeImpactarCredito ? (
          <View style={[s.regBanner, reg.nivel === 'critico' ? s.regCritico : s.regPendente]}>
            <Text style={s.regTitulo}>{reg.titulo}</Text>
            <Text style={s.regMsg}>{reg.mensagem}</Text>
            {reg.docsObrigatoriosFaltando.length > 0 ? (
              <Text style={s.regFalta}>
                Falta: {reg.docsObrigatoriosFaltando.map((t) => CATALOGO_DIGITAL[t].label).join(', ')}
              </Text>
            ) : null}
            <Text style={s.regDisclaimer}>{reg.disclaimer}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={() => sincronizar(imovel)}
          disabled={sincronizando}
          style={s.syncBtn}
          accessibilityRole="button"
          accessibilityLabel="Sincronizar documentos com o gov.br"
        >
          <Text style={s.syncBtnTxt}>
            {sincronizando ? 'Sincronizando…' : '🔄 Sincronizar com gov.br'}
          </Text>
        </TouchableOpacity>

        <Text style={s.secaoTitulo}>Adicionar documentos</Text>
        <Text style={s.secaoHint}>
          Toque em um tipo para adicionar. Todos os campos são opcionais.
        </Text>
        <View style={s.gridTipos}>
          {ORDEM_TIPOS.map((tipo) => (
            <BotaoTipo
              key={tipo}
              meta={TIPOS_META[tipo]}
              onPress={() => abrirMenu(tipo)}
              disabled={busy}
            />
          ))}
        </View>
        {busy && (
          <View style={s.busyRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={s.busyTexto}>Aguarde…</Text>
          </View>
        )}

        <Text style={[s.secaoTitulo, { marginTop: 20 }]}>
          Documentos anexados{documentos.length > 0 ? ` (${documentos.length})` : ''}
        </Text>
        {documentos.length === 0 ? (
          <EmptyState
            title="Nenhum documento ainda"
            hint={
              'Adicione a matrícula, o CCIR e fotos da divisa.\n' +
              'Você pode avançar sem documentos e adicionar depois.'
            }
          />
        ) : (
          <View style={s.listaDoc}>
            {documentos.map((doc) => (
              <ItemDocumento key={doc.id} doc={doc} onRemover={removerDoc} onPress={abrirDocumento} />
            ))}
          </View>
        )}
      </ScrollView>

      <View style={s.rodape}>
        <Button label="Voltar" variant="secondary" onPress={goBack} />
        <View style={s.actionSpacer} />
        <Button
          label="Revisão"
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

  breadcrumb: { fontSize: 12, color: colors.mutedText, marginBottom: 6 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  titleCar: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: colors.inkText,
    lineHeight: 28,
  },
  protoco: { fontSize: 12, color: colors.mutedText, marginBottom: 14 },

  actionRow: { flexDirection: 'row', marginBottom: 16 },
  actionSpacer: { width: 10 },

  secaoCard: { marginBottom: 12 },
  secaoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  secaoTitulo: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.inkText,
    marginBottom: 4,
    marginTop: 16,
  },
  secaoHint: { fontSize: 13, color: colors.mutedText, marginBottom: 12, lineHeight: 18 },

  preview: { width: '100%', height: 180, borderRadius: 10, backgroundColor: colors.verdeBg },
  previewPlaceholder: {
    height: 140,
    backgroundColor: colors.neutral,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  previewPlaceholderText: { fontSize: 13, color: colors.mutedText, textAlign: 'center' },
  previewMeta: { fontSize: 11, color: colors.mutedText, marginTop: 8, textAlign: 'center' },

  historicoItem: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  historicoDot: { width: 10, height: 10, borderRadius: 5 },
  historicoLbl: { fontSize: 14, fontWeight: '700', color: colors.inkText },
  historicoData: { fontSize: 12, color: colors.mutedText, marginTop: 1 },

  metricsRow: { flexDirection: 'row', marginBottom: 10 },
  metricSpacer: { width: 10 },
  metricCard: {
    flex: 1,
    backgroundColor: colors.verdeBg,
    borderRadius: 12,
    padding: 14,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  metricValue: { fontSize: 26, fontWeight: '800', color: colors.inkText },
  metricSub: { fontSize: 11, color: colors.mutedText, marginTop: 2 },

  tabBar: {
    flexDirection: 'row',
    marginTop: 14,
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    marginBottom: -1,
  },
  tabLabelText: { fontSize: 13, fontWeight: '600', color: colors.mutedText },
  tabLabelActive: { color: colors.primary, fontWeight: '800' },
  tabCard: { borderTopLeftRadius: 0, borderTopRightRadius: 0, marginBottom: 12 },
  tabContent: { gap: 12 },
  tabEmpty: { fontSize: 13, color: colors.mutedText, fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 },

  infoRow: { gap: 2 },
  infoLabel: { fontSize: 11, fontWeight: '700', color: colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 15, fontWeight: '600', color: colors.inkText },

  mapLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 6,
  },
  map: { height: 180, borderRadius: 12, overflow: 'hidden' },

  domDocRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  domDocLabel: { flex: 1, fontSize: 13, color: colors.inkText },

  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  checkBody: { flex: 1 },
  checkLabel: { fontSize: 14, fontWeight: '700', color: colors.inkText },
  checkDetail: { fontSize: 12, color: colors.mutedText, marginTop: 1 },

  gridTipos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tipoBtn: {
    width: '47%',
    backgroundColor: colors.branco,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    minHeight: 88,
    justifyContent: 'center',
  },
  tipoBtnDisabled: { opacity: 0.5 },
  tipoBtnIcone: { fontSize: 22, marginBottom: 4 },
  tipoBtnLabel: { fontSize: 13, fontWeight: '800', color: colors.inkText, marginBottom: 2 },
  tipoBtnDesc: { fontSize: 11, color: colors.mutedText, lineHeight: 15 },
  tipoBtnOrigem: { fontSize: 10, color: colors.primary, lineHeight: 14, marginTop: 5, fontWeight: '700' },

  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  busyTexto: { fontSize: 13, color: colors.mutedText },

  listaDoc: { gap: 10 },
  itemDoc: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.branco,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    gap: 10,
  },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.verdeBg },
  thumbPdf: { alignItems: 'center', justifyContent: 'center' },
  thumbPdfIcone: { fontSize: 28 },
  itemInfo: { flex: 1, gap: 3 },
  itemNome: { fontSize: 13, fontWeight: '700', color: colors.inkText },
  itemTipo: { fontSize: 11, color: colors.mutedText },
  itemGeo: { fontSize: 11, color: colors.verdeClaro },

  btnRemover: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fde8e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRemoverTexto: { fontSize: 14, color: colors.critico, fontWeight: '800' },

  regBanner: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12, gap: 4 },
  // ponytail: colors.alerta é vermelho (≡ critico); aviso é âmbar — correto para pendente
  regPendente: { backgroundColor: '#FFF7E6', borderColor: colors.aviso },
  regCritico: { backgroundColor: '#FDECEC', borderColor: colors.critico },
  regTitulo: { fontSize: 14, fontWeight: '800', color: colors.inkText },
  regMsg: { fontSize: 13, color: colors.inkText },
  regFalta: { fontSize: 12, fontWeight: '700', color: colors.mutedText },
  regDisclaimer: { fontSize: 10, color: colors.mutedText, marginTop: 2 },
  syncBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.verdeBg, alignSelf: 'flex-start', marginBottom: 10 },
  syncBtnTxt: { fontSize: 13, fontWeight: '700', color: colors.primary },
  docOrigem: { fontSize: 11, fontWeight: '700', color: colors.primary, marginTop: 2 },

  rodape: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.branco,
  },
});
