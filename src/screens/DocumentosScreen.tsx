// Wizard passo 3 — Documentos. Lista e adiciona anexos ao imóvel.
// Documentos são opcionais: o produtor pode sempre avançar para a revisão.
import { useCallback, useEffect, useState } from 'react';
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
import { Screen } from '../app/Screen';
import { WizardSteps } from '../app/WizardSteps';
import { useNav } from '../app/navigation';
import { getImovel, updateImovel } from '../lib/store';
import { deleteDocumentFile, pickDocument, pickFromLibrary, takePhoto } from '../lib/documents';
import { Badge, EmptyState, PrimaryButton, SecondaryButton } from '../ui';
import { colors } from '../theme/colors';
import type { Documento, DocumentoTipo } from '../types';

// ---------------------------------------------------------------------------
// Rótulos e metadados de cada tipo de documento
// ---------------------------------------------------------------------------

type TipoMeta = {
  label: string;
  descricao: string;
  icone: string;
  /** Quais ações oferecer no menu de escolha */
  acoes: ('camera' | 'galeria' | 'arquivo')[];
  geotag?: boolean;
};

const TIPOS_META: Record<DocumentoTipo, TipoMeta> = {
  matricula: {
    label: 'Matrícula',
    descricao: 'Escritura ou matrícula do imóvel',
    icone: '📄',
    acoes: ['camera', 'galeria', 'arquivo'],
  },
  ccir: {
    label: 'CCIR',
    descricao: 'Certidão de Cadastro do Imóvel Rural',
    icone: '📄',
    acoes: ['camera', 'galeria', 'arquivo'],
  },
  rg: {
    label: 'RG / CPF',
    descricao: 'Documento de identidade do produtor',
    icone: '🪪',
    acoes: ['camera', 'galeria', 'arquivo'],
  },
  car: {
    label: 'Recibo CAR',
    descricao: 'Comprovante de cadastro anterior',
    icone: '📋',
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

// Ordem de exibição dos botões de adicionar
const ORDEM_TIPOS: DocumentoTipo[] = ['matricula', 'ccir', 'rg', 'car', 'foto-divisa', 'outro'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ehImagem(doc: Documento): boolean {
  if (doc.mime) return doc.mime.startsWith('image/');
  return /\.(jpg|jpeg|png|gif|webp|heic|bmp)$/i.test(doc.nome);
}

function rotuloBadge(tipo: DocumentoTipo): string {
  return TIPOS_META[tipo]?.label ?? tipo;
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

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
    </TouchableOpacity>
  );
}

function ItemDocumento({
  doc,
  onRemover,
}: {
  doc: Documento;
  onRemover: (doc: Documento) => void;
}) {
  const imagem = ehImagem(doc);
  const meta = TIPOS_META[doc.tipo];
  const geotagged = doc.tipo === 'foto-divisa' && doc.lat != null && doc.lng != null;

  function confirmarRemocao() {
    Alert.alert(
      'Remover documento',
      `Deseja remover "${doc.nome}"? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => onRemover(doc) },
      ],
    );
  }

  return (
    <View style={s.itemDoc} accessibilityLabel={`Documento: ${doc.nome}, tipo ${meta?.label ?? doc.tipo}`}>
      {/* Miniatura ou ícone */}
      {imagem ? (
        <Image source={{ uri: doc.uri }} style={s.thumb} resizeMode="cover" accessibilityLabel="" />
      ) : (
        <View style={[s.thumb, s.thumbPdf]}>
          <Text style={s.thumbPdfIcone}>📄</Text>
        </View>
      )}

      {/* Informações */}
      <View style={s.itemInfo}>
        <Text style={s.itemNome} numberOfLines={1}>
          {doc.nome}
        </Text>
        <Badge tone="neutro">{rotuloBadge(doc.tipo)}</Badge>
        {geotagged && (
          <Text style={s.itemGeo}>📍 georreferenciada</Text>
        )}
      </View>

      {/* Botão remover */}
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

// ---------------------------------------------------------------------------
// Tela principal
// ---------------------------------------------------------------------------

export function DocumentosScreen({ imovelId }: { imovelId: string }) {
  const { navigate, goBack } = useNav();
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Carrega lista de documentos já salvos no imóvel
  useEffect(() => {
    let ativo = true;
    getImovel(imovelId).then((im) => {
      if (!ativo) return;
      if (im) setDocumentos(im.documentos);
      setLoading(false);
    });
    return () => {
      ativo = false;
    };
  }, [imovelId]);

  // Persiste a lista no store sempre que ela mudar
  async function salvarLista(nova: Documento[]): Promise<void> {
    setDocumentos(nova);
    await updateImovel(imovelId, { documentos: nova });
  }

  // Adiciona um documento recém-capturado
  const adicionarDoc = useCallback(
    async (doc: Documento) => {
      await salvarLista([...documentos, doc]);
    },
    [documentos], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Remove da lista e apaga o arquivo do sandbox
  const removerDoc = useCallback(
    async (doc: Documento) => {
      await deleteDocumentFile(doc);
      await salvarLista(documentos.filter((d) => d.id !== doc.id));
    },
    [documentos], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Ações de captura
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

  // Monta o Alert de escolha de ação para cada tipo
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

    Alert.alert(meta.label, meta.descricao, [
      ...botoes.map((b) => ({ text: b.text, onPress: b.onPress })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <Screen title="Documentos" subtitle="Anexos e fotos da divisa">
        <WizardSteps active={2} />
        <View style={s.centralize}>
          <ActivityIndicator color={colors.verde} size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Documentos" subtitle="Anexos e fotos da divisa">
      <WizardSteps active={2} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Seção: botões de adicionar */}
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
            <ActivityIndicator color={colors.verde} />
            <Text style={s.busyTexto}>Aguarde…</Text>
          </View>
        )}

        {/* Seção: lista de documentos */}
        <Text style={[s.secaoTitulo, { marginTop: 24 }]}>
          Documentos anexados{documentos.length > 0 ? ` (${documentos.length})` : ''}
        </Text>

        {documentos.length === 0 ? (
          <EmptyState
            title="Nenhum documento ainda"
            hint={
              'Adicione a matrícula, o CCIR e fotos da divisa do imóvel.\n' +
              'Você pode avançar sem documentos e adicionar depois.'
            }
          />
        ) : (
          <View style={s.listaDoc}>
            {documentos.map((doc) => (
              <ItemDocumento key={doc.id} doc={doc} onRemover={removerDoc} />
            ))}
          </View>
        )}

        {/* Dica quando vazio para o rodapé */}
        {documentos.length === 0 && (
          <View style={s.dicaVazio}>
            <Text style={s.dicaVazioTexto}>
              Dica: fotos da divisa com localização ajudam a confirmar o perímetro desenhado.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Rodapé fixo */}
      <View style={s.rodape}>
        <SecondaryButton label="Voltar" onPress={goBack} />
        <View style={s.rodapeEspaco} />
        <PrimaryButton
          label="Avançar"
          onPress={() => navigate({ name: 'revisao', imovelId })}
        />
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  centralize: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 8,
  },

  // Seções
  secaoTitulo: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 4,
  },
  secaoHint: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 12,
    lineHeight: 18,
  },

  // Grid de tipos (2 por linha)
  gridTipos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tipoBtn: {
    // ~metade da largura menos o gap e o padding
    width: '47%',
    backgroundColor: colors.branco,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    minHeight: 88,
    justifyContent: 'center',
  },
  tipoBtnDisabled: {
    opacity: 0.5,
  },
  tipoBtnIcone: {
    fontSize: 22,
    marginBottom: 4,
  },
  tipoBtnLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 2,
  },
  tipoBtnDesc: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 15,
  },

  // Indicador de operação em andamento
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  busyTexto: {
    fontSize: 13,
    color: colors.muted,
  },

  // Lista de documentos
  listaDoc: {
    gap: 10,
  },
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
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.verdeBg,
  },
  thumbPdf: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPdfIcone: {
    fontSize: 28,
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemNome: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  itemGeo: {
    fontSize: 11,
    color: colors.verdeClaro,
    marginTop: 2,
  },

  // Botão remover
  btnRemover: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fde8e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRemoverTexto: {
    fontSize: 14,
    color: colors.alerta,
    fontWeight: '800',
  },

  // Dica quando vazio
  dicaVazio: {
    marginTop: 12,
    backgroundColor: colors.verdeBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dicaVazioTexto: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
    textAlign: 'center',
  },

  // Rodapé
  rodape: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.branco,
  },
  rodapeEspaco: {
    width: 10,
  },
});
