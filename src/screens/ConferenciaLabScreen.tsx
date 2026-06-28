// Conferência de Terreno do ANALISTA.
//
// O analista faz uma NOVA MEDIÇÃO por cima do mapa do fazendeiro. A tela mostra,
// num só mapa de satélite, 3 camadas:
//   (1) Dados Governo — camadas OFICIAIS (TI/UC, embargo, desmate, queimada, APP/rio,
//       CAR vizinho): contorno vermelho, sem preenchimento (colors.critico).
//   (2) Medição Produtor — perímetro DECLARADO pelo fazendeiro: azul preenchido (colors.tertiary).
//   (3) Medição Analista — re-medição conferida: verde (colors.primary).
// A área de DIFERENÇA aparece em âmbar (acrescido) / azul-escuro (suprimido).
//
// A simulação anima DOIS avatares (F/fazendeiro × A/analista) a 4x, com perímetros
// que divergem de propósito. Resultado: painel de avisos, topologia, sobreposições
// e ações (recusar / agendar / aceitar, encaminhar a órgão, anexar documentos).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { type LngLat } from '../lib/geo';
import { analisarSobreposicoes, type AnaliseAmbiental } from '../lib/overlay';
import { DEMO_CAMADAS, DEMO_PERIMETRO_ANTERIOR } from '../lib/refLayers.demo';
import { decisaoSugerida } from '../lib/alteracao';
import {
  gerarPainelAvisos,
  orgaosDoPainel,
  type AvisoConferencia,
  type PainelAvisos,
} from '../lib/conferencia';
import { useSimulatedWalk, type SimStatus } from '../sim/useSimulatedWalk';
import { useAlteracaoDelta } from '../hooks/useAlteracaoDelta';
import { getImovel, updateImovel } from '../lib/store';
import { pickDocument, takePhoto } from '../lib/documents';
import { Button } from '../ui';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import type { Documento, ValidacaoStatus } from '../types';
import type { Severidade } from '../lib/overlay';

// ---------- constantes ----------

const SCREEN_HEIGHT = Dimensions.get('window').height;
// Mapa imersivo (igual à tela do produtor): domina a 1ª dobra — só mapa + legenda;
// o resto (topologia, avisos, decisão) aparece ao rolar.
const MAP_HEIGHT = Math.max(280, Math.floor(SCREEN_HEIGHT * 0.46));

const ROTA_FAZENDEIRO = 'sorriso-fazendeiro';
const ROTA_ANALISTA = 'sorriso-soja';
/** Velocidade fixa da simulação (4x) */
const SIM_SPEED = 4;

// Perímetro DECLARADO pelo fazendeiro (referência estática + comparação).
const DECLARADO = DEMO_PERIMETRO_ANTERIOR;

const toLatLng = (p: LngLat) => ({ latitude: p.latitude, longitude: p.longitude });

// ponytail: todas as camadas oficiais usam a mesma cor canônica (Dados Governo = vermelho).
const CAMADA_POLYS = DEMO_CAMADAS.map((c) => ({
  coords: (c.rings[0] ?? []).map((coord) => ({ latitude: coord[1] ?? 0, longitude: coord[0] ?? 0 })),
}));

type LatLng = { latitude: number; longitude: number };

// Região que enquadra TODA a geometria (declarado + camadas) com folga — antes
// centralizava no 1º vértice e a geometria ficava jogada num canto.
function regionFromCoords(coords: LatLng[]) {
  const lats = coords.map((c) => c.latitude);
  const lngs = coords.map((c) => c.longitude);
  const latitude = (Math.min(...lats) + Math.max(...lats)) / 2;
  const longitude = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  return {
    latitude,
    longitude,
    latitudeDelta: Math.max((Math.max(...lats) - Math.min(...lats)) * 1.6, 0.01),
    longitudeDelta: Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.6, 0.01),
  };
}

const REGION = regionFromCoords([...DECLARADO.map(toLatLng), ...CAMADA_POLYS.flatMap((c) => c.coords)]);

// ponytail: cores por tone — usando tokens canônicos.
const sevColor: Record<Severidade, string> = {
  critico: colors.critico,
  alerta:  colors.aviso,
  info:    colors.mutedText,
};
const toneColor = { ok: colors.primary, aviso: colors.aviso, alerta: colors.critico } as const;
const toneBg    = { ok: '#e2f3e8', aviso: '#fdf4e3', alerta: '#fce8e7' } as const;

/** Combina o status das duas simulações num único estado de UI. */
function combinarStatus(a: SimStatus, b: SimStatus): SimStatus {
  if (a === 'done' && b === 'done') return 'done';
  if (a === 'walking' || b === 'walking') return 'walking';
  if (a === 'paused' || b === 'paused') return 'paused';
  return 'idle';
}

type Aceite = ValidacaoStatus | null;

// ---------- tela ----------

export function ConferenciaLabScreen({ imovelId, car }: { imovelId?: string; car?: string }) {
  const { switchTab, goBack } = useNav();
  const insets = useSafeAreaInsets();
  const simFaz = useSimulatedWalk(); // avatar do fazendeiro (Medição Produtor)
  const simAna = useSimulatedWalk(); // avatar do analista (Medição Analista)
  const mapRef = useRef<MapView>(null);
  const regiaoRef = useRef(REGION); // região atual (para os botões +/−)

  const zoom = (fator: number) => {
    const r = regiaoRef.current;
    mapRef.current?.animateToRegion(
      { ...r, latitudeDelta: r.latitudeDelta * fator, longitudeDelta: r.longitudeDelta * fator },
      220,
    );
  };
  const recentralizar = () => mapRef.current?.animateToRegion(REGION, 300);

  const [imovelNome, setImovelNome] = useState<string | null>(null);
  const [aceite, setAceite] = useState<Aceite>(null);
  const [encaminhado, setEncaminhado] = useState(false);
  const [docs, setDocs] = useState<Documento[]>([]);
  // Decisão em confirmação no modal (reprovado/aprovado) ou null.
  const [confirmando, setConfirmando] = useState<ValidacaoStatus | null>(null);
  const [nota, setNota] = useState('');

  useEffect(() => {
    if (!imovelId) return;
    let alive = true;
    getImovel(imovelId).then((im) => {
      if (alive && im) setImovelNome(im.imovel.nome || 'Imóvel');
    });
    return () => {
      alive = false;
    };
  }, [imovelId]);

  const conferido = simAna.points; // re-medição do analista
  const status = combinarStatus(simFaz.status, simAna.status);
  const mostrarDelta = status === 'paused' || status === 'done';

  // Topologia (declarado × conferido) + anéis de diferença para o mapa.
  const delta = useAlteracaoDelta(DECLARADO, conferido, DEMO_CAMADAS, 'offline-demo', conferido.length >= 3);
  const relatorio = delta.relatorio;

  // Camadas oficiais tocadas pela re-medição.
  const analise = useMemo<AnaliseAmbiental | null>(
    () => (conferido.length >= 3 ? analisarSobreposicoes(conferido, DEMO_CAMADAS, 'offline-demo') : null),
    [conferido],
  );

  // Painel de avisos ("o que revisitar").
  const painel = useMemo<PainelAvisos>(
    () => gerarPainelAvisos(conferido, analise, relatorio),
    [conferido, analise, relatorio],
  );

  const concordancia = useMemo(() => {
    if (!relatorio) return null;
    const uniao = relatorio.areaNova_ha + relatorio.suprimido_ha;
    if (uniao <= 0) return null;
    return (Math.max(0, relatorio.areaNova_ha - relatorio.acrescido_ha) / uniao) * 100;
  }, [relatorio]);

  const conferidoCoords = conferido.length >= 3 ? conferido.map(toLatLng) : null;
  const decisao = relatorio ? decisaoSugerida(relatorio.severidade) : null;

  // ---------- controles das duas simulações ----------
  const iniciar = () => {
    simFaz.setSpeed(SIM_SPEED);
    simAna.setSpeed(SIM_SPEED);
    simFaz.start(ROTA_FAZENDEIRO);
    simAna.start(ROTA_ANALISTA);
  };
  const limpar = () => {
    simFaz.reset();
    simAna.reset();
    setAceite(null);
    setEncaminhado(false);
    setDocs([]);
    setConfirmando(null);
    setNota('');
  };

  const acaoPrincipal =
    status === 'idle'
      ? { label: '▶ Iniciar simulação', onPress: iniciar }
      : status === 'walking'
        ? { label: '⏸ Pausar', onPress: () => { simFaz.pause(); simAna.pause(); } }
        : status === 'paused'
          ? { label: '▶ Retomar', onPress: () => { simFaz.resume(); simAna.resume(); } }
          : { label: '↺ Refazer', onPress: iniciar };

  // ---------- ações do analista ----------
  const abrirDecisao = (st: ValidacaoStatus) => {
    setNota('');
    setConfirmando(st);
  };

  const voltarParaHome = () => {
    if (imovelId) switchTab({ name: 'validacao' });
    else goBack();
  };

  const confirmarDecisao = async () => {
    const st = confirmando;
    if (!st) return;
    setAceite(st);
    setConfirmando(null);
    if (imovelId) {
      await updateImovel(imovelId, {
        validacao: { status: st, nota: nota.trim() || undefined, analista: 'Analista', updatedAt: Date.now() },
      });
    }
    voltarParaHome();
  };

  const encaminhar = () => {
    const orgaos = orgaosDoPainel(painel);
    if (orgaos.length === 0) {
      Alert.alert('Sem encaminhamento', 'Nenhum aviso crítico/alerta exige notificar órgão.');
      return;
    }
    Alert.alert(
      'Encaminhar alerta',
      `Notificar: ${orgaos.join(', ')}?\n\nOs alertas e a geometria conferida entram na fila de encaminhamentos (envio quando houver rede).`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Encaminhar',
          style: 'destructive',
          onPress: () => {
            setEncaminhado(true);
            Alert.alert('Encaminhado', `Alerta na fila para: ${orgaos.join(', ')}.`);
          },
        },
      ],
    );
  };

  const anexar = () => {
    Alert.alert('Anexar documento de validação', 'O que deseja anexar?', [
      {
        text: 'Foto da divisa (GPS)',
        onPress: () => takePhoto('foto-divisa', { geotag: true }).then((d) => d && setDocs((p) => [...p, d])),
      },
      {
        text: 'Documento / laudo',
        onPress: () => pickDocument('outro').then((d) => d && setDocs((p) => [...p, d])),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const statusTexto =
    status === 'idle'
      ? null
      : status === 'done' && relatorio
        ? `Concluído — Δ ${relatorio.delta_ha >= 0 ? '+' : ''}${relatorio.delta_ha.toFixed(1)} ha (${relatorio.delta_pct >= 0 ? '+' : ''}${relatorio.delta_pct.toFixed(0)}%)`
        : `Simulando · ${SIM_SPEED}x · ${Math.round(Math.min(simFaz.progress, simAna.progress) * 100)}%`;

  return (
    // Sem title/subtitle → só a app-bar fina, igual à tela de medição do produtor.
    <Screen>
      {/* Mapa imersivo num container próprio (igual ao produtor): o mapa preenche
          o container e fica livre para arrastar; os overlays ficam nos cantos. */}
      <View style={s.mapWrap}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={REGION}
        mapType="satellite"
        showsCompass
        onRegionChangeComplete={(r) => { regiaoRef.current = r; }}
      >

        {/* (1) Dados Governo — contorno vermelho, sem preenchimento */}
        {CAMADA_POLYS.map((c, i) =>
          c.coords.length >= 3 ? (
            <Polygon
              key={`cam-${i}`}
              coordinates={c.coords}
              strokeColor={colors.critico}
              fillColor="transparent"
              strokeWidth={1.5}
            />
          ) : null,
        )}

        {/* (2) Medição Produtor (declarado) — azul preenchido */}
        <Polygon
          coordinates={DECLARADO.map(toLatLng)}
          strokeColor={colors.tertiary}
          fillColor={`${colors.tertiary}33`}
          strokeWidth={2.5}
        />

        {/* Diferença: acrescido (âmbar) / suprimido (azul) — só parado/concluído */}
        {mostrarDelta &&
          delta.acrescidoRings.map((r, i) =>
            r.length >= 3 ? (
              <Polygon key={`acr-${i}`} coordinates={r.map(toLatLng)} fillColor="rgba(245,158,11,0.40)" strokeColor={colors.acrescido} strokeWidth={1} />
            ) : null,
          )}
        {mostrarDelta &&
          delta.suprimidoRings.map((r, i) =>
            r.length >= 3 ? (
              <Polygon key={`sup-${i}`} coordinates={r.map(toLatLng)} fillColor="rgba(37,121,199,0.35)" strokeColor={colors.suprimido} strokeWidth={1} />
            ) : null,
          )}

        {/* (3) Medição Analista (conferido) — verde */}
        {conferidoCoords && (
          <Polygon
            coordinates={conferidoCoords}
            strokeColor={colors.primary}
            fillColor={`${colors.primary}33`}
            strokeWidth={3}
          />
        )}

        {/* Trilha do fazendeiro — azul (consistente com Medição Produtor) */}
        {simFaz.points.length > 1 && (
          <Polyline
            coordinates={simFaz.points.map(toLatLng)}
            strokeColor={colors.tertiary}
            strokeWidth={2}
          />
        )}
        {/* Trilha do analista — verde (consistente com Medição Analista) */}
        {simAna.points.length > 1 && (
          <Polyline
            coordinates={simAna.points.map(toLatLng)}
            strokeColor={colors.primary}
            strokeWidth={3.5}
          />
        )}

        {/* Avatar F — azul (Medição Produtor) */}
        {simFaz.avatar && (
          <Marker coordinate={toLatLng(simFaz.avatar)} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[s.avatar, { backgroundColor: colors.tertiary, borderColor: colors.tertiary }]}>
              <Text style={[s.avatarLabel, { color: colors.branco }]}>F</Text>
            </View>
          </Marker>
        )}
        {/* Avatar A — verde (Medição Analista) */}
        {simAna.avatar && (
          <Marker coordinate={toLatLng(simAna.avatar)} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[s.avatar, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              <Text style={[s.avatarLabel, { color: colors.branco }]}>A</Text>
            </View>
          </Marker>
        )}

      </MapView>

      {/* Contexto sobre o mapa (canto sup. esq.) — substitui o pageHead.
          O status da simulação entra como 3ª linha (sem pill separada que travava o pan). */}
      <View style={s.mapTitle} pointerEvents="none">
        <Text style={s.mapTitleH} numberOfLines={1}>Conferência de campo</Text>
        <Text style={s.mapTitleSub} numberOfLines={1}>
          {imovelNome ? `Medindo: ${imovelNome}` : car ? `CAR ${car}` : 'Analista mede por cima do declarado'}
        </Text>
        {statusTexto && <Text style={s.mapStatus} numberOfLines={1}>{statusTexto}</Text>}
      </View>

      {/* Controles de mapa: + / − / recentralizar (canto sup. direito) */}
      <View style={s.mapControls}>
        <TouchableOpacity style={s.mapBtn} onPress={() => zoom(0.5)} activeOpacity={0.8} accessibilityLabel="Aproximar">
          <Text style={s.mapBtnTxt}>＋</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.mapBtn} onPress={() => zoom(2)} activeOpacity={0.8} accessibilityLabel="Afastar">
          <Text style={s.mapBtnTxt}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.mapBtn} onPress={recentralizar} activeOpacity={0.8} accessibilityLabel="Centralizar">
          <Text style={s.mapBtnIcon}>⊕</Text>
        </TouchableOpacity>
      </View>

      {/* Legenda compacta no canto inf. esq. — só as cores dos desenhos */}
      <View style={s.legendOverlay} pointerEvents="none">
        <LegendLine cor={colors.critico} label="Dados governo" outlined />
        <LegendLine cor={colors.tertiary} label="Medição produtor" />
        <LegendLine cor={colors.primary} label="Medição analista" />
        {relatorio && <LegendLine cor={colors.acrescido} label="Acrescido (+)" />}
        {relatorio && <LegendLine cor={colors.suprimido} label="Suprimido (−)" />}
      </View>
      </View>

      <ScrollView style={s.panel} contentContainerStyle={s.panelContent} showsVerticalScrollIndicator={false}>

        {status === 'idle' ? (
          <Text style={s.hint}>
            Inicie a simulação: o avatar do fazendeiro (F) e o do analista (A) caminham a {SIM_SPEED}x sobre o mesmo
            terreno e divergem. O app calcula a divergência e as sobreposições com as camadas oficiais.
          </Text>
        ) : null}

        {relatorio && decisao && (
          <>
            {/* Situação / decisão sugerida */}
            <View style={[s.banner, { backgroundColor: toneBg[decisao.tone], borderColor: toneColor[decisao.tone] }]}>
              <Text style={[s.bannerTitle, { color: toneColor[decisao.tone] }]}>{decisao.titulo}</Text>
              <Text style={s.bannerText}>{decisao.detalhe}</Text>
              {decisao.prazo && <Text style={[s.bannerPrazo, { color: toneColor[decisao.tone] }]}>Prazo sugerido: {decisao.prazo}</Text>}
            </View>

            {/* Topologia */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Topologia · declarado × conferido</Text>
              <View style={s.tripleRow}>
                <Triple label="Declarado" value={`${relatorio.areaAnterior_ha.toFixed(2)} ha`} sub="produtor" />
                <Triple label="Conferido" value={`${relatorio.areaNova_ha.toFixed(2)} ha`} sub="analista" />
                <Triple
                  label="Diferença"
                  value={`${relatorio.delta_ha >= 0 ? '+' : ''}${relatorio.delta_ha.toFixed(2)} ha`}
                  sub={`${relatorio.delta_pct >= 0 ? '+' : ''}${relatorio.delta_pct.toFixed(1)}%`}
                  highlight
                />
              </View>
              {concordancia != null && (
                <Text style={s.concord}>
                  Concordância (IoU) com o declarado: <Text style={s.concordVal}>{concordancia.toFixed(0)}%</Text>
                </Text>
              )}
            </View>

            {/* Painel de avisos: o que revisitar */}
            <View style={s.card}>
              <Text style={s.cardTitle}>O que revisitar nesta medição</Text>
              {painel.avisos.length > 0 ? (
                painel.avisos.map((a, i) => <AvisoRow key={`${a.codigo}-${i}`} aviso={a} />)
              ) : (
                <Text style={s.semAviso}>{'✓'} Nenhum aviso — medição conforme as camadas oficiais (demo).</Text>
              )}
              {painel.temDadosOffline && (
                <Text style={s.disclaimer}>
                  Camadas offline de demonstração — validar com bases oficiais (IBAMA/INCRA/FUNAI/ICMBio) quando houver rede.
                  Sobreposição não prova invasão.
                </Text>
              )}
            </View>

            {/* Decisão do analista — já está em campo remedindo, então só recusa/aceita
                (agendar visita é ação remota do painel, não faz sentido aqui). */}
            <Text style={s.sectionLabel}>DECISÃO DO ANALISTA</Text>
            <View style={s.decisaoRow}>
              <DecisaoChip label="Recusar medição" tone="alerta" ativo={aceite === 'reprovado'} onPress={() => abrirDecisao('reprovado')} />
              <DecisaoChip label="Aceitar medição" tone="ok"     ativo={aceite === 'aprovado'}  onPress={() => abrirDecisao('aprovado')} />
            </View>

            {/* Encaminhar a órgão */}
            <TouchableOpacity style={s.acaoCard} activeOpacity={0.85} onPress={encaminhar}>
              <View style={{ flex: 1 }}>
                <Text style={s.acaoTitle}>Encaminhar alerta a órgão responsável</Text>
                <Text style={s.acaoSub}>
                  {encaminhado ? '✓ Encaminhado — na fila de envio' : 'Notificar FUNAI, ICMBio, IBAMA, INCRA…'}
                </Text>
              </View>
              <Text style={s.acaoIcon}>{'→'}</Text>
            </TouchableOpacity>

            {/* Anexar documentos */}
            <TouchableOpacity style={s.acaoCard} activeOpacity={0.85} onPress={anexar}>
              <View style={{ flex: 1 }}>
                <Text style={s.acaoTitle}>Anexar documentos de validação</Text>
                <Text style={s.acaoSub}>
                  {docs.length > 0 ? `✓ ${docs.length} anexo(s)` : 'Foto da divisa (GPS), laudo ou croqui'}
                </Text>
              </View>
              <Text style={s.acaoIcon}>{'＋'}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Rodapé: Limpar (compacto) · ação principal (flex) — botões irmãos com a
          mesma base (mesma altura, sem wrappers assimétricos). */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button label="Limpar" variant="secondary" onPress={limpar} disabled={status === 'idle'} style={s.btnLimpar} />
        <Button label={acaoPrincipal.label} variant="primary" onPress={acaoPrincipal.onPress} />
      </View>

      {/* Modal de confirmação: recusar / aceitar medição */}
      <Modal visible={confirmando != null} transparent animationType="slide" onRequestClose={() => setConfirmando(null)}>
        <Pressable style={s.mBackdrop} onPress={() => setConfirmando(null)}>
          <Pressable style={s.mSheet} onPress={() => {}}>
            <View style={s.mHandle} />
            <Text style={[s.mTitle, { color: confirmando === 'reprovado' ? colors.critico : colors.primary }]}>
              {confirmando === 'reprovado' ? 'Recusar medição' : 'Aceitar medição'}
            </Text>
            {relatorio && (
              <Text style={s.mSub}>
                {imovelNome ?? 'Imóvel'} · diferença {relatorio.delta_ha >= 0 ? '+' : ''}
                {relatorio.delta_ha.toFixed(2)} ha ({relatorio.delta_pct >= 0 ? '+' : ''}
                {relatorio.delta_pct.toFixed(1)}%)
              </Text>
            )}
            <Text style={s.mDesc}>
              {confirmando === 'reprovado'
                ? 'A medição do produtor será marcada como reprovada. Ela continua na fila de visitas para conferência em campo.'
                : 'A medição do produtor será aceita e sai da fila de pendências.'}
            </Text>
            <Text style={s.mLabel}>Observação (opcional)</Text>
            <TextInput
              style={s.mInput}
              placeholder="Ex.: divergência confirmada na divisa leste…"
              placeholderTextColor={colors.mutedText}
              value={nota}
              onChangeText={setNota}
              multiline
            />
            <View style={s.mActions}>
              <TouchableOpacity style={s.mCancel} onPress={() => setConfirmando(null)} activeOpacity={0.8}>
                <Text style={s.mCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.mOk, { backgroundColor: confirmando === 'reprovado' ? colors.critico : colors.primary }]}
                onPress={confirmarDecisao}
                activeOpacity={0.85}
              >
                <Text style={s.mOkTxt}>{confirmando === 'reprovado' ? 'Confirmar recusa' : 'Confirmar'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

// ---------- sub-componentes ----------

/**
 * Linha da legenda compacta sobre o mapa.
 * - outlined: só o anel colorido (Dados Governo, sem preenchimento no mapa).
 * - padrão:   ponto preenchido (perímetros / diferença).
 */
function LegendLine({ cor, label, outlined }: { cor: string; label: string; outlined?: boolean }) {
  return (
    <View style={s.legendLine}>
      <View style={[s.legendDot, { borderColor: cor, backgroundColor: outlined ? 'transparent' : cor }]} />
      <Text style={s.legendText}>{label}</Text>
    </View>
  );
}

function Triple({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <View style={s.triple}>
      <Text style={s.tripleLabel}>{label}</Text>
      <Text style={[s.tripleValue, highlight && { color: colors.primary }]}>{value}</Text>
      {sub ? <Text style={s.tripleSub}>{sub}</Text> : null}
    </View>
  );
}

function AvisoRow({ aviso }: { aviso: AvisoConferencia }) {
  return (
    <View style={s.avisoRow}>
      <View style={[s.avisoDot, { backgroundColor: sevColor[aviso.severidade] }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.avisoRotulo}>
          {aviso.rotulo}
          {aviso.detalhe ? ` · ${aviso.detalhe}` : ''}
        </Text>
        <Text style={s.avisoAcao}>{aviso.acao}</Text>
        <Text style={s.avisoLegal}>{aviso.significadoLegal}</Text>
      </View>
    </View>
  );
}

function DecisaoChip({ label, tone, ativo, onPress }: { label: string; tone: 'ok' | 'aviso' | 'alerta'; ativo: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[s.decisaoChip, ativo && { backgroundColor: toneBg[tone], borderColor: toneColor[tone], borderWidth: 2 }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[s.decisaoChipText, ativo && { color: toneColor[tone] }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------- estilos ----------

const s = StyleSheet.create({
  panel: { flex: 1, backgroundColor: colors.branco },
  panelContent: { padding: 14, paddingBottom: 28 },

  // Mapa imersivo num container próprio — o mapa preenche e fica livre para arrastar.
  mapWrap: { height: MAP_HEIGHT },

  // Título sobre o mapa (substitui o pageHead) — canto superior esquerdo, livre do compass
  mapTitle: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 62,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  mapTitleH: { fontSize: 15, fontFamily: fonts.extraBold, color: colors.inkText },
  mapTitleSub: { fontSize: 11, fontFamily: fonts.regular, color: colors.mutedText, marginTop: 1 },
  mapStatus: { fontSize: 11, fontFamily: fonts.bold, color: colors.primary, marginTop: 3 },

  // Controles +/−/centralizar (canto sup. direito do mapa)
  mapControls: { position: 'absolute', top: 10, right: 10, gap: 6 },
  mapBtn: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  mapBtnTxt: { fontSize: 22, fontFamily: fonts.bold, color: colors.inkText, lineHeight: 26 },
  mapBtnIcon: { fontSize: 18, color: colors.inkText, lineHeight: 22 },

  // Legenda compacta no canto inferior esquerdo do mapa
  legendOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  legendLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  legendText: { fontSize: 11, fontFamily: fonts.bold, color: colors.inkText },

  hint: { fontSize: 14, fontFamily: fonts.regular, color: colors.mutedText, lineHeight: 20, marginTop: 4 },

  banner: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  bannerTitle: { fontSize: 16, fontFamily: fonts.extraBold },
  bannerText: { fontSize: 13, fontFamily: fonts.regular, color: colors.inkText, marginTop: 4, lineHeight: 18 },
  bannerPrazo: { fontSize: 13, fontFamily: fonts.bold, marginTop: 6 },

  card: {
    backgroundColor: colors.verdeBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.inkText, marginBottom: 10 },

  tripleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  triple: { flex: 1, alignItems: 'center' },
  tripleLabel: { fontSize: 11, fontFamily: fonts.bold, color: colors.mutedText, textTransform: 'uppercase' },
  tripleValue: { fontSize: 16, fontFamily: fonts.extraBold, color: colors.inkText, marginTop: 3 },
  tripleSub: { fontSize: 11, fontFamily: fonts.regular, color: colors.mutedText, marginTop: 1 },
  concord: { fontSize: 13, fontFamily: fonts.regular, color: colors.inkText, marginTop: 12 },
  concordVal: { fontFamily: fonts.extraBold, color: colors.primary },

  avisoRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  avisoDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  avisoRotulo: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.inkText, lineHeight: 17 },
  avisoAcao: { fontSize: 12, fontFamily: fonts.bold, color: colors.primary, marginTop: 2, lineHeight: 16 },
  avisoLegal: { fontSize: 11, fontFamily: fonts.regular, color: colors.mutedText, marginTop: 2, lineHeight: 15 },
  semAviso: { fontSize: 13, fontFamily: fonts.bold, color: colors.primary },
  disclaimer: { fontSize: 10, fontFamily: fonts.regular, color: colors.mutedText, fontStyle: 'italic', marginTop: 8, lineHeight: 14 },

  sectionLabel: { fontSize: 11, fontFamily: fonts.extraBold, color: colors.mutedText, letterSpacing: 0.6, marginBottom: 8 },
  decisaoRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  decisaoChip: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.branco,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decisaoChipText: { fontSize: 12, fontFamily: fonts.extraBold, color: colors.mutedText, textAlign: 'center' },

  acaoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  acaoTitle: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.inkText },
  acaoSub: { fontSize: 12, fontFamily: fonts.regular, color: colors.mutedText, marginTop: 2 },
  acaoIcon: { fontSize: 20, fontFamily: fonts.extraBold, color: colors.primary },

  // Avatares no mapa
  avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avatarLabel: { fontSize: 12, fontFamily: fonts.extraBold },

  // Rodapé — padronizado com a tela do produtor (cantos arredondados, sombra ascendente,
  // padding inferior pelo safe-area). paddingBottom vem do inset (aplicado inline).
  footer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: colors.neutral,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  // Limpar tem largura fixa (override do flex:1 da base); a ação principal mantém flex:1.
  btnLimpar: { flex: 0, width: 112 },

  // Modal de confirmação da decisão
  mBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  mSheet: {
    backgroundColor: colors.branco,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 34,
  },
  mHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 12 },
  mTitle: { fontSize: 19, fontFamily: fonts.extraBold },
  mSub: { fontSize: 13, fontFamily: fonts.semibold, color: colors.inkText, marginTop: 4 },
  mDesc: { fontSize: 13, fontFamily: fonts.regular, color: colors.mutedText, lineHeight: 19, marginTop: 8 },
  mLabel: { fontSize: 12, fontFamily: fonts.extraBold, color: colors.mutedText, marginTop: 16, marginBottom: 6 },
  mInput: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.inkText,
    textAlignVertical: 'top',
  },
  mActions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  mCancel: { flex: 1, paddingVertical: 15, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  mCancelTxt: { fontSize: 15, fontFamily: fonts.extraBold, color: colors.mutedText },
  mOk: { flex: 2, paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  mOkTxt: { fontSize: 15, fontFamily: fonts.extraBold, color: colors.branco },
});
