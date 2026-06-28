import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { getImovel } from '../lib/store';
import { areaHectares, perimeterM } from '../lib/geo';
import { bboxOf, fetchCamadasPorBBox } from '../lib/refLayers';
import {
  analisarSobreposicoes,
  type AnaliseAmbiental,
  type Sobreposicao,
} from '../lib/overlay';
import { avaliarCredito, type AptidaoCredito, type LinhaCredito } from '../lib/credito';
import {
  Badge,
  Card,
  EmptyState,
  SecondaryButton,
  SectionTitle,
  StatBox,
} from '../ui';
import { colors } from '../theme/colors';
import type { Imovel } from '../types';

function fonteLabel(fonte: AnaliseAmbiental['fonteDados']): string {
  if (fonte === 'online') return 'Dados oficiais online (WFS governamental)';
  if (fonte === 'cache') return 'Dados em cache local';
  return 'Camada de demonstração — sem conexão ativa';
}

function scoreBarColor(score: number): string {
  if (score >= 70) return colors.verde;
  if (score >= 40) return colors.aviso;
  return colors.alerta;
}

/** Estimativa de ha por módulo fiscal (referência conservadora; confirmar no CCIR). */
const MF_HA_REF = 20;

interface SevStyle { bg: string; border: string; text: string }

function sevStyle(sev: Sobreposicao['severidade']): SevStyle {
  switch (sev) {
    case 'critico': return { bg: '#fce8e7', border: colors.alerta, text: colors.alerta };
    case 'alerta':  return { bg: '#fdf4e3', border: '#c07a1a',      text: colors.aviso };
    case 'info':    return { bg: colors.verdeBg, border: colors.line, text: colors.muted };
  }
}

function SobreposicaoCard({ item }: { item: Sobreposicao }) {
  const st = sevStyle(item.severidade);
  // Cicatriz de fogo ganha ícone próprio (🔥); demais seguem a severidade.
  const icone =
    item.tipo === 'queimada'
      ? '🔥'
      : item.severidade === 'critico'
        ? '⛔'
        : item.severidade === 'alerta'
          ? '⚠'
          : 'ℹ';
  const areaFmt =
    item.area_ha < 10 ? item.area_ha.toFixed(1) : Math.round(item.area_ha).toString();
  const pctFmt =
    item.percentual < 10
      ? item.percentual.toFixed(1)
      : Math.round(item.percentual).toString();

  return (
    <View style={[sc.sobCard, { backgroundColor: st.bg, borderColor: st.border }]}>
      <View style={sc.sobHead}>
        <Text style={[sc.sobNome, { color: st.text }]} numberOfLines={2}>
          {icone} {item.nome}
        </Text>
        <Text style={[sc.sobArea, { color: st.text }]}>
          {areaFmt} ha ({pctFmt}%)
        </Text>
      </View>
      <Text style={sc.sobFonte}>{item.fonte}</Text>
      <Text style={[sc.sobMsg, { color: st.text }]}>{item.mensagem}</Text>
    </View>
  );
}

function LinhaCard({ linha }: { linha: LinhaCredito }) {
  const teto =
    linha.tetoEstimado_BRL != null
      ? linha.tetoEstimado_BRL.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
          maximumFractionDigits: 0,
        })
      : null;

  return (
    <View style={sc.linhaWrap}>
      <View style={sc.linhaHead}>
        <Text style={sc.linhaNome} numberOfLines={2}>
          {linha.nome}
        </Text>
        <Badge tone={linha.apto ? 'ok' : 'aviso'}>
          {linha.apto ? 'Apto' : 'Bloqueado'}
        </Badge>
      </View>
      <Text style={sc.linhaMotivo}>{linha.motivo}</Text>
      {linha.apto && teto ? (
        <Text style={sc.linhaTeto}>Teto estimado: {teto}</Text>
      ) : null}
    </View>
  );
}

export function AnaliseAmbientalScreen({ imovelId }: { imovelId: string }) {
  const { goBack } = useNav();

  const [fase, setFase] = useState<'loading' | 'error' | 'pronto'>('loading');
  const [imovel, setImovel] = useState<Imovel | null>(null);
  const [analise, setAnalise] = useState<AnaliseAmbiental | null>(null);
  const [credito, setCredito] = useState<AptidaoCredito | null>(null);

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        const im = await getImovel(imovelId);
        if (!alive) return;

        if (!im || im.geometry.points.length < 3) {
          setFase('error');
          return;
        }

        setImovel(im);

        // Busca camadas — offline-resiliente: retorna DEMO_CAMADAS se sem rede
        const bbox = bboxOf(im.geometry.points);
        const { camadas, fonte } = await fetchCamadasPorBBox(bbox);
        if (!alive) return;

        const a = analisarSobreposicoes(im.geometry.points, camadas, fonte);
        const c = avaliarCredito(a, im);
        if (!alive) return;

        setAnalise(a);
        setCredito(c);
        setFase('pronto');
      } catch {
        if (alive) setFase('error');
      }
    }

    run();
    return () => { alive = false; };
  }, [imovelId]);

  if (fase === 'loading') {
    return (
      <Screen title="Análise Ambiental" subtitle="Verificando camadas…">
        <View style={sc.center}>
          <Text style={sc.loadText}>
            Buscando dados ambientais…{'\n'}
            Usa dados locais se não houver conexão.
          </Text>
        </View>
      </Screen>
    );
  }

  if (fase === 'error' || !imovel || !analise || !credito) {
    return (
      <Screen title="Análise Ambiental">
        <View style={sc.center}>
          <Text style={sc.errTitle}>Não foi possível analisar o imóvel.</Text>
          <Text style={sc.errHint}>
            Verifique se o imóvel possui pelo menos 3 vértices demarcados.
          </Text>
          <View style={sc.btnWrap}>
            <SecondaryButton label="Voltar" onPress={goBack} />
          </View>
        </View>
      </Screen>
    );
  }

  const points = imovel.geometry.points;
  const areaCalc = areaHectares(points);
  const perimCalc = perimeterM(points);
  const criticos = analise.sobreposicoes.filter((s) => s.severidade === 'critico').length;
  const totalSob = analise.sobreposicoes.length;
  const barColor = scoreBarColor(credito.score);
  const barWidth = `${Math.max(0, Math.min(100, credito.score))}%` as `${number}%`;

  return (
    <Screen title="Análise Ambiental" subtitle={imovel.imovel.nome}>
      <ScrollView contentContainerStyle={sc.scroll} showsVerticalScrollIndicator={false}>

        <View style={[sc.banner, analise.ok ? sc.bannerOk : sc.bannerCritico]}>
          <Text style={[sc.bannerTitulo, { color: analise.ok ? colors.verde : colors.alerta }]}>
            {analise.ok
              ? totalSob === 0
                ? 'Nenhuma sobreposição detectada'
                : `Sem sobreposições críticas (${totalSob} aviso${totalSob > 1 ? 's' : ''})`
              : `Atenção: ${criticos} sobreposição${criticos > 1 ? 'ões' : ''} crítica${criticos > 1 ? 's' : ''}`}
          </Text>
          <Text style={sc.bannerFonte}>{fonteLabel(analise.fonteDados)}</Text>
        </View>

        {analise.incertezaPosicional_m != null && analise.incertezaPosicional_m > 5 ? (
          <View style={sc.gpsWarn}>
            <Text style={sc.gpsWarnText}>
              Precisão do GPS ~{Math.round(analise.incertezaPosicional_m)} m —
              sobreposições pequenas podem ser imprecisas.
            </Text>
          </View>
        ) : null}

        <Card style={sc.card}>
          <SectionTitle>Medidas do imóvel</SectionTitle>
          <View style={sc.statsRow}>
            <StatBox label="Área calculada (ha)" value={areaCalc.toFixed(2)} />
            <View style={sc.statGap} />
            <StatBox
              label="Perímetro (m)"
              value={Math.round(perimCalc).toLocaleString('pt-BR')}
            />
          </View>
          {imovel.imovel.modulosFiscais != null ? (
            <Text style={sc.mfNote}>
              {imovel.imovel.modulosFiscais} módulos fiscais declarados — referência ~
              {(imovel.imovel.modulosFiscais * MF_HA_REF).toFixed(0)} ha
              (estimativa; confirme no CCIR/INCRA).
            </Text>
          ) : null}
        </Card>

        <Card style={sc.card}>
          <SectionTitle>Sobreposições identificadas</SectionTitle>
          {analise.sobreposicoes.length === 0 ? (
            <EmptyState
              title="Nenhuma sobreposição"
              hint="O imóvel não cruza camadas de restrição ambiental nos dados analisados."
            />
          ) : (
            analise.sobreposicoes.map((s, i) => (
              <SobreposicaoCard key={`sob-${i}`} item={s} />
            ))
          )}
        </Card>

        <Card style={sc.card}>
          <SectionTitle>O que sua terra destrava</SectionTitle>

          <View style={sc.scoreRow}>
            <Text style={[sc.scoreNum, { color: barColor }]}>{credito.score}</Text>
            <Text style={sc.scoreLabel}>/100 — conformidade ambiental</Text>
          </View>
          <View style={sc.scoreTrack}>
            <View
              style={{ height: 10, width: barWidth, backgroundColor: barColor, borderRadius: 5 }}
            />
          </View>

          <View style={sc.elegRow}>
            <Badge tone={credito.elegivelGeral ? 'ok' : 'aviso'}>
              {credito.elegivelGeral
                ? 'Elegível ao crédito rural'
                : 'Bloqueado — veja os impedimentos abaixo'}
            </Badge>
          </View>

          {credito.bloqueios.length > 0 ? (
            <View style={sc.bloqWrap}>
              <Text style={sc.bloqTitulo}>Impedimentos:</Text>
              {credito.bloqueios.map((b, i) => (
                <Text key={`bl-${i}`} style={sc.bloqItem}>• {b}</Text>
              ))}
            </View>
          ) : null}

          <Text style={sc.linhasTitulo}>Linhas de crédito:</Text>
          {credito.linhas.map((l) => <LinhaCard key={l.id} linha={l} />)}

          {credito.recomendacoes.length > 0 ? (
            <View style={sc.recsWrap}>
              <Text style={sc.recsTitulo}>Próximos passos:</Text>
              {credito.recomendacoes.map((r, i) => (
                <Text key={`rec-${i}`} style={sc.recItem}>• {r}</Text>
              ))}
            </View>
          ) : null}

          <Text style={sc.disclaimer}>{credito.disclaimer}</Text>
        </Card>

        <View style={sc.btnWrap}>
          <SecondaryButton label="Voltar" onPress={goBack} />
        </View>

      </ScrollView>
    </Screen>
  );
}

const sc = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  loadText: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  errTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  errHint: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },

  banner: { borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1.5 },
  bannerOk: { backgroundColor: '#e6f4ec', borderColor: colors.verde },
  bannerCritico: { backgroundColor: '#fce8e7', borderColor: colors.alerta },
  bannerTitulo: { fontSize: 16, fontWeight: '800', lineHeight: 22 },
  bannerFonte: { fontSize: 11, color: colors.muted, marginTop: 4 },

  gpsWarn: {
    backgroundColor: '#fdf4e3',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#c07a1a',
  },
  gpsWarnText: { fontSize: 12, color: colors.aviso, lineHeight: 18 },

  card: { marginBottom: 12 },
  statsRow: { flexDirection: 'row', marginTop: 4 },
  statGap: { width: 8 },
  mfNote: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 10,
    lineHeight: 17,
    fontStyle: 'italic',
  },

  sobCard: { borderRadius: 12, borderWidth: 1.5, padding: 12, marginBottom: 10 },
  sobHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  sobNome: { flex: 1, fontSize: 13, fontWeight: '800', lineHeight: 18 },
  sobArea: { fontSize: 13, fontWeight: '700', textAlign: 'right', flexShrink: 0 },
  sobFonte: { fontSize: 10, color: colors.muted, marginTop: 3, fontStyle: 'italic' },
  sobMsg: { fontSize: 12, lineHeight: 18, marginTop: 6 },

  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 8,
  },
  scoreNum: { fontSize: 36, fontWeight: '800' },
  scoreLabel: { fontSize: 12, color: colors.muted },
  scoreTrack: {
    height: 10,
    backgroundColor: colors.line,
    borderRadius: 5,
    marginBottom: 16,
    overflow: 'hidden',
  },

  elegRow: { marginBottom: 14 },

  bloqWrap: {
    backgroundColor: '#fce8e7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  bloqTitulo: { fontSize: 13, fontWeight: '800', color: colors.alerta, marginBottom: 6 },
  bloqItem: {
    fontSize: 12,
    color: colors.alerta,
    lineHeight: 18,
    marginBottom: 4,
  },

  linhasTitulo: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 8,
    marginTop: 2,
  },
  linhaWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
    marginBottom: 10,
  },
  linhaHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  linhaNome: { flex: 1, fontSize: 13, fontWeight: '800', color: colors.ink },
  linhaMotivo: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  linhaTeto: { fontSize: 12, color: colors.verde, fontWeight: '700', marginTop: 4 },

  recsWrap: {
    backgroundColor: colors.verdeBg,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  recsTitulo: { fontSize: 13, fontWeight: '800', color: colors.ink, marginBottom: 6 },
  recItem: { fontSize: 12, color: colors.ink, lineHeight: 18, marginBottom: 4 },

  disclaimer: {
    fontSize: 10,
    color: colors.muted,
    lineHeight: 15,
    marginTop: 12,
    fontStyle: 'italic',
  },

  btnWrap: { marginTop: 8, marginBottom: 8 },
});
