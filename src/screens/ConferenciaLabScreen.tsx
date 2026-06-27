// Conferência de Terreno do ANALISTA.
//
// O analista faz uma NOVA MEDIÇÃO por cima do mapa do fazendeiro. A tela mostra,
// num só mapa de satélite, 3 camadas: (1) camadas OFICIAIS (TI/UC, embargo,
// desmate, queimada, APP/rio, CAR vizinho), (2) marcação do FAZENDEIRO (declarado,
// branco tracejado) e (3) a re-medição do ANALISTA (conferido, verde). A área de
// DIFERENÇA aparece em âmbar (acrescido) / azul (suprimido).
//
// A simulação anima DOIS avatares (fazendeiro × analista) a 4x, com perímetros
// que divergem de propósito. Resultado: painel de avisos ("o que revisitar"),
// topologia, sobreposições e ações (recusar / agendar / aceitar, encaminhar a
// órgão, anexar documentos de validação).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';

import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { CalendarModal, type Periodo } from '../ui/CalendarModal';
import { areaHectares, type LngLat } from '../lib/geo';
import { analisarSobreposicoes, type AnaliseAmbiental, type CamadaTipo } from '../lib/overlay';
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
import { PrimaryButton, SecondaryButton } from '../ui';
import { colors } from '../theme/colors';
import type { Documento, ValidacaoStatus } from '../types';
import type { Severidade } from '../lib/overlay';

// ---------- constantes ----------

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAP_HEIGHT = Math.max(220, Math.floor(SCREEN_HEIGHT * 0.34));

const ROTA_FAZENDEIRO = 'sorriso-fazendeiro';
const ROTA_ANALISTA = 'sorriso-soja';
/** Velocidade fixa da simulação (4x) — esperada para fazendeiro e analista. */
const SIM_SPEED = 4;

// Perímetro DECLARADO pelo fazendeiro (referência estática + comparação).
const DECLARADO = DEMO_PERIMETRO_ANTERIOR;

const REGION = {
  latitude: DECLARADO[0]!.latitude,
  longitude: DECLARADO[0]!.longitude,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

const toLatLng = (p: LngLat) => ({ latitude: p.latitude, longitude: p.longitude });

/** Cor por tipo de camada oficial (translúcida sobre o satélite). */
function camadaCor(tipo: CamadaTipo): string {
  switch (tipo) {
    case 'terra_indigena':
    case 'unidade_conservacao':
      return '#b5651d';
    case 'embargo_ibama':
      return colors.alerta;
    case 'desmatamento':
      return colors.terra;
    case 'queimada':
      return '#d35400';
    case 'app_hidrografia':
    case 'hidrografia':
      return colors.suprimido;
    case 'car_vizinho':
      return colors.muted;
  }
}

function tipoLabel(tipo: CamadaTipo): string {
  switch (tipo) {
    case 'terra_indigena':
    case 'unidade_conservacao':
      return 'TI / UC';
    case 'embargo_ibama':      return 'Embargo';
    case 'desmatamento':       return 'Desmate';
    case 'queimada':           return 'Queimada';
    case 'app_hidrografia':
    case 'hidrografia':        return 'APP / Rio';
    case 'car_vizinho':        return 'CAR viz.';
  }
}

/** Camadas oficiais demo convertidas para anéis do react-native-maps. */
const CAMADA_POLYS = DEMO_CAMADAS.map((c) => ({
  tipo: c.tipo,
  cor: camadaCor(c.tipo),
  coords: (c.rings[0] ?? []).map((coord) => ({ latitude: coord[1] ?? 0, longitude: coord[0] ?? 0 })),
}));

/** Tipos oficiais únicos presentes nas camadas demo (para a legenda). */
const CAMADA_TIPOS_LEGENDA = Array.from(new Set(DEMO_CAMADAS.map((c) => c.tipo)));

const sevColor: Record<Severidade, string> = {
  critico: colors.alerta,
  alerta: colors.aviso,
  info: colors.muted,
};
const toneColor = { ok: colors.verde, aviso: colors.aviso, alerta: colors.alerta } as const;
const toneBg = { ok: '#e2f3e8', aviso: '#fdf4e3', alerta: '#fce8e7' } as const;

/** Combina o status das duas simulações num único estado de UI. */
function combinarStatus(a: SimStatus, b: SimStatus): SimStatus {
  if (a === 'done' && b === 'done') return 'done';
  if (a === 'walking' || b === 'walking') return 'walking';
  if (a === 'paused' || b === 'paused') return 'paused';
  return 'idle';
}

type Aceite = ValidacaoStatus | null;

// ---------- tela ----------

export function ConferenciaLabScreen({ imovelId }: { imovelId?: string }) {
  const { switchTab, goBack } = useNav();
  const simFaz = useSimulatedWalk(); // avatar do fazendeiro
  const simAna = useSimulatedWalk(); // avatar do analista
  const mapRef = useRef<MapView>(null);

  const [imovelNome, setImovelNome] = useState<string | null>(null);
  const [aceite, setAceite] = useState<Aceite>(null);
  const [encaminhado, setEncaminhado] = useState(false);
  const [docs, setDocs] = useState<Documento[]>([]);
  // Decisão em confirmação no modal (reprovado/aprovado) ou null.
  const [confirmando, setConfirmando] = useState<ValidacaoStatus | null>(null);
  const [nota, setNota] = useState('');
  // Calendário de agendamento aberto?
  const [agendando, setAgendando] = useState(false);

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
  // A mecânica roda sempre em 4x (esperado tanto pro fazendeiro quanto pro analista).
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
    setAgendando(false);
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
  // "Agendar visita" abre o calendário; recusar/aceitar abrem o modal de confirmação.
  const abrirDecisao = (st: ValidacaoStatus) => {
    if (st === 'pendente') {
      setAgendando(true);
    } else {
      setNota('');
      setConfirmando(st);
    }
  };

  // Volta para a aba do analista, que recarrega a lista ao montar.
  const voltarParaHome = (tab: 'validacao' | 'visitas') => {
    if (imovelId) switchTab({ name: tab });
    else goBack();
  };

  // Persiste recusar/aceitar e volta para a Triagem com a lista atualizada.
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
    voltarParaHome('validacao');
  };

  // Persiste o agendamento (data + período) e vai para a fila de Visitas.
  const confirmarAgendamento = async (ts: number, periodo: Periodo) => {
    setAgendando(false);
    setAceite('pendente');
    if (imovelId) {
      await updateImovel(imovelId, {
        visitaAgendada: { agendadaEm: Date.now(), dataVisita: ts, periodo, analista: 'Analista' },
        validacao: { status: 'pendente', analista: 'Analista', updatedAt: Date.now() },
      });
    }
    voltarParaHome('visitas');
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

  return (
    <Screen
      title="Conferência de campo"
      subtitle={imovelNome ? `Medindo: ${imovelNome}` : 'Analista mede por cima do declarado'}
    >
      <MapView ref={mapRef} style={{ height: MAP_HEIGHT }} initialRegion={REGION} mapType="satellite" showsCompass>
        {/* (1) Camadas OFICIAIS */}
        {CAMADA_POLYS.map((c, i) =>
          c.coords.length >= 3 ? (
            <Polygon key={`cam-${i}`} coordinates={c.coords} strokeColor={c.cor} fillColor={`${c.cor}33`} strokeWidth={1.5} />
          ) : null,
        )}

        {/* (2) Declarado (fazendeiro) — branco tracejado */}
        <Polygon
          coordinates={DECLARADO.map(toLatLng)}
          strokeColor="#ffffff"
          fillColor="rgba(255,255,255,0.06)"
          strokeWidth={2.5}
          lineDashPattern={[8, 5]}
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

        {/* (3) Conferido (analista) — verde */}
        {conferidoCoords && (
          <Polygon coordinates={conferidoCoords} strokeColor={colors.verde} fillColor="rgba(27,107,58,0.20)" strokeWidth={3} />
        )}

        {/* Trilhas dos dois avatares */}
        {simFaz.points.length > 1 && (
          <Polyline coordinates={simFaz.points.map(toLatLng)} strokeColor="#ffffff" strokeWidth={2} lineDashPattern={[6, 4]} />
        )}
        {simAna.points.length > 1 && (
          <Polyline coordinates={simAna.points.map(toLatLng)} strokeColor={colors.verdeClaro} strokeWidth={3.5} />
        )}

        {/* Avatares */}
        {simFaz.avatar && (
          <Marker coordinate={toLatLng(simFaz.avatar)} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[s.avatar, { backgroundColor: colors.branco, borderColor: colors.terra }]}>
              <Text style={[s.avatarLabel, { color: colors.terra }]}>F</Text>
            </View>
          </Marker>
        )}
        {simAna.avatar && (
          <Marker coordinate={toLatLng(simAna.avatar)} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[s.avatar, { backgroundColor: colors.verde, borderColor: colors.verdeClaro }]}>
              <Text style={[s.avatarLabel, { color: colors.branco }]}>A</Text>
            </View>
          </Marker>
        )}

      </MapView>

      {status !== 'idle' && (
        <View style={s.pill}>
          <Text style={s.pillText}>
            {status === 'done' && relatorio
              ? `Concluído — Δ ${relatorio.delta_ha >= 0 ? '+' : ''}${relatorio.delta_ha.toFixed(1)} ha (${relatorio.delta_pct >= 0 ? '+' : ''}${relatorio.delta_pct.toFixed(0)}%)`
              : `Simulando Fazendeiro × Analista · ${SIM_SPEED}x · ${Math.round(Math.min(simFaz.progress, simAna.progress) * 100)}%`}
          </Text>
        </View>
      )}

      <ScrollView style={s.panel} contentContainerStyle={s.panelContent} showsVerticalScrollIndicator={false}>
        {/* Legenda agrupada (casa com as cores do mapa) */}
        <View style={s.legend}>
          <Text style={s.legendGroup}>OFICIAL</Text>
          <View style={s.chipRow}>
            {CAMADA_TIPOS_LEGENDA.map((t) => (
              <LegendChip key={t} cor={camadaCor(t)} label={tipoLabel(t)} />
            ))}
          </View>
          <Text style={s.legendGroup}>PERÍMETROS</Text>
          <View style={s.chipRow}>
            <LegendChip cor="#ffffff" label="Fazendeiro" dashed />
            <LegendChip cor={colors.verde} label="Analista" />
          </View>
          {relatorio && (
            <>
              <Text style={s.legendGroup}>DIFERENÇA</Text>
              <View style={s.chipRow}>
                <LegendChip cor={colors.acrescido} label="Acrescido (+)" solid />
                <LegendChip cor={colors.suprimido} label="Suprimido (−)" solid />
              </View>
            </>
          )}
        </View>

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
                <Triple label="Declarado" value={`${relatorio.areaAnterior_ha.toFixed(2)} ha`} sub="fazendeiro" />
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
                <Text style={s.semAviso}>✓ Nenhum aviso — medição conforme as camadas oficiais (demo).</Text>
              )}
              {painel.temDadosOffline && (
                <Text style={s.disclaimer}>
                  Camadas offline de demonstração — validar com bases oficiais (IBAMA/INCRA/FUNAI/ICMBio) quando houver rede.
                  Sobreposição não prova invasão.
                </Text>
              )}
            </View>

            {/* Decisão do analista */}
            <Text style={s.sectionLabel}>DECISÃO DO ANALISTA</Text>
            <View style={s.decisaoRow}>
              <DecisaoChip label="Recusar medição" tone="alerta" ativo={aceite === 'reprovado'} onPress={() => abrirDecisao('reprovado')} />
              <DecisaoChip label="Agendar visita" tone="aviso" ativo={aceite === 'pendente'} onPress={() => abrirDecisao('pendente')} />
              <DecisaoChip label="Aceitar medição" tone="ok" ativo={aceite === 'aprovado'} onPress={() => abrirDecisao('aprovado')} />
            </View>

            {/* Encaminhar a órgão */}
            <TouchableOpacity style={s.acaoCard} activeOpacity={0.85} onPress={encaminhar}>
              <View style={{ flex: 1 }}>
                <Text style={s.acaoTitle}>Encaminhar alerta a órgão responsável</Text>
                <Text style={s.acaoSub}>
                  {encaminhado ? '✓ Encaminhado — na fila de envio' : 'Notificar FUNAI, ICMBio, IBAMA, INCRA…'}
                </Text>
              </View>
              <Text style={s.acaoIcon}>→</Text>
            </TouchableOpacity>

            {/* Anexar documentos */}
            <TouchableOpacity style={s.acaoCard} activeOpacity={0.85} onPress={anexar}>
              <View style={{ flex: 1 }}>
                <Text style={s.acaoTitle}>Anexar documentos de validação</Text>
                <Text style={s.acaoSub}>
                  {docs.length > 0 ? `✓ ${docs.length} anexo(s)` : 'Foto da divisa (GPS), laudo ou croqui'}
                </Text>
              </View>
              <Text style={s.acaoIcon}>＋</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Rodapé: Limpar (compacto) · ação principal (flex) — mesmo par limpo da Triagem. */}
      <View style={s.footer}>
        <View style={s.footerLimpar}>
          <SecondaryButton label="Limpar" onPress={limpar} disabled={status === 'idle'} />
        </View>
        <View style={s.footerMain}>
          <PrimaryButton label={acaoPrincipal.label} onPress={acaoPrincipal.onPress} />
        </View>
      </View>

      {/* Modal de confirmação: recusar / aceitar medição */}
      <Modal visible={confirmando != null} transparent animationType="slide" onRequestClose={() => setConfirmando(null)}>
        <Pressable style={s.mBackdrop} onPress={() => setConfirmando(null)}>
          <Pressable style={s.mSheet} onPress={() => {}}>
            <View style={s.mHandle} />
            <Text style={[s.mTitle, { color: confirmando === 'reprovado' ? colors.alerta : colors.verde }]}>
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
              placeholderTextColor={colors.muted}
              value={nota}
              onChangeText={setNota}
              multiline
            />
            <View style={s.mActions}>
              <TouchableOpacity style={s.mCancel} onPress={() => setConfirmando(null)} activeOpacity={0.8}>
                <Text style={s.mCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.mOk, { backgroundColor: confirmando === 'reprovado' ? colors.alerta : colors.verde }]}
                onPress={confirmarDecisao}
                activeOpacity={0.85}
              >
                <Text style={s.mOkTxt}>{confirmando === 'reprovado' ? 'Confirmar recusa' : 'Confirmar'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Calendário de agendamento de visita */}
      <CalendarModal
        visible={agendando}
        title="Agendar visita de campo"
        subtitle={imovelNome ?? undefined}
        confirmLabel="Confirmar visita"
        onConfirm={confirmarAgendamento}
        onClose={() => setAgendando(false)}
      />
    </Screen>
  );
}

// ---------- sub-componentes ----------

function LegendChip({ cor, label, dashed, solid }: { cor: string; label: string; dashed?: boolean; solid?: boolean }) {
  return (
    <View style={[s.chip, { borderColor: cor, backgroundColor: solid ? `${cor}22` : `${cor}1f` }, dashed && s.chipDashed]}>
      <View style={[s.chipDot, { backgroundColor: cor, borderColor: dashed ? colors.muted : cor }]} />
      <Text style={s.chipText}>{label}</Text>
    </View>
  );
}

function Triple({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <View style={s.triple}>
      <Text style={s.tripleLabel}>{label}</Text>
      <Text style={[s.tripleValue, highlight && { color: colors.verde }]}>{value}</Text>
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

  pill: {
    position: 'absolute',
    top: MAP_HEIGHT - 34 + 0,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  pillText: { fontSize: 12, fontWeight: '700', color: colors.ink, textAlign: 'center' },

  // Legenda
  legend: { marginBottom: 10 },
  legendGroup: { fontSize: 9, fontWeight: '800', color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 6, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 24, paddingHorizontal: 7, borderRadius: 4, borderWidth: 1 },
  chipDashed: { borderStyle: 'dashed' },
  chipDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1 },
  chipText: { fontSize: 10, fontWeight: '700', color: colors.ink },

  hint: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 4 },

  banner: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  bannerTitle: { fontSize: 16, fontWeight: '800' },
  bannerText: { fontSize: 13, color: colors.ink, marginTop: 4, lineHeight: 18 },
  bannerPrazo: { fontSize: 13, fontWeight: '800', marginTop: 6 },

  card: { backgroundColor: colors.verdeBg, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: '800', color: colors.ink, marginBottom: 10 },

  tripleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  triple: { flex: 1, alignItems: 'center' },
  tripleLabel: { fontSize: 11, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' },
  tripleValue: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 3 },
  tripleSub: { fontSize: 11, color: colors.muted, marginTop: 1 },
  concord: { fontSize: 13, color: colors.ink, marginTop: 12 },
  concordVal: { fontWeight: '800', color: colors.verde },

  avisoRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  avisoDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  avisoRotulo: { fontSize: 13, fontWeight: '800', color: colors.ink, lineHeight: 17 },
  avisoAcao: { fontSize: 12, color: colors.verde, fontWeight: '700', marginTop: 2, lineHeight: 16 },
  avisoLegal: { fontSize: 11, color: colors.muted, marginTop: 2, lineHeight: 15 },
  semAviso: { fontSize: 13, color: colors.verde, fontWeight: '700' },
  disclaimer: { fontSize: 10, color: colors.muted, fontStyle: 'italic', marginTop: 8, lineHeight: 14 },

  sectionLabel: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 0.6, marginBottom: 8 },
  decisaoRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  decisaoChip: { flex: 1, paddingVertical: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.branco, alignItems: 'center', justifyContent: 'center' },
  decisaoChipText: { fontSize: 12, fontWeight: '800', color: colors.muted, textAlign: 'center' },

  acaoCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, marginBottom: 10 },
  acaoTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  acaoSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  acaoIcon: { fontSize: 20, fontWeight: '800', color: colors.verde },

  // Avatares no mapa
  avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avatarLabel: { fontSize: 12, fontWeight: '800' },

  // Rodapé — barra fixa; paddingBottom limpa o home indicator (sem safe-area-context).
  footer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 34,
    backgroundColor: colors.branco,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  footerLimpar: { width: 104 },
  footerMain: { flex: 1, justifyContent: 'center' },

  // Modal de confirmação da decisão
  mBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  mSheet: { backgroundColor: colors.branco, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 34 },
  mHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 12 },
  mTitle: { fontSize: 19, fontWeight: '800' },
  mSub: { fontSize: 13, color: colors.ink, fontWeight: '600', marginTop: 4 },
  mDesc: { fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 8 },
  mLabel: { fontSize: 12, fontWeight: '800', color: colors.muted, marginTop: 16, marginBottom: 6 },
  mInput: { minHeight: 64, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, fontSize: 14, color: colors.ink, textAlignVertical: 'top' },
  mActions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  mCancel: { flex: 1, paddingVertical: 15, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  mCancelTxt: { fontSize: 15, fontWeight: '800', color: colors.muted },
  mOk: { flex: 2, paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  mOkTxt: { fontSize: 15, fontWeight: '800', color: colors.branco },
});
