// Aba "Triagem" (analista) — revisa a geometria de cada imóvel e aprova/reprova.
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { Badge, EmptyState, PrimaryButton, SecondaryButton } from '../ui';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { listImoveis, updateImovel } from '../lib/store';
import { validatePerimeter } from '../lib/geo';
import { analisarSobreposicoes, type AnaliseAmbiental, type CamadaTipo } from '../lib/overlay';
import { analisarAlteracaoImovel, decisaoSugerida, type AlteracaoImovel } from '../lib/alteracao';
import { DEMO_CAMADAS } from '../lib/refLayers.demo';
import type { Imovel, ValidacaoStatus } from '../types';

/** Rótulo curto por tipo de camada — para a triagem do analista. */
function tipoLabel(tipo: CamadaTipo): string {
  switch (tipo) {
    case 'terra_indigena':     return 'TI';
    case 'unidade_conservacao': return 'UC';
    case 'embargo_ibama':      return 'Embargo';
    case 'desmatamento':       return 'Desmat.';
    case 'queimada':           return 'Queimada';
    case 'app_hidrografia':    return 'APP';
    case 'hidrografia':        return 'Hidrografia';
    case 'car_vizinho':        return 'CAR viz.';
  }
}

// ponytail: aliases canônicos referenciados aqui; mesmos hex que os aliases legados.
const altColor = { ok: colors.primary, aviso: colors.aviso, alerta: colors.critico } as const;
const altBg    = { ok: '#e2f3e8', aviso: '#fdf4e3', alerta: '#fce8e7' } as const;

export function ValidacaoScreen() {
  const { navigate } = useNav();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [analises, setAnalises] = useState<Record<string, AnaliseAmbiental>>({});
  const [alteracoes, setAlteracoes] = useState<Record<string, AlteracaoImovel>>({});

  const load = useCallback(() => {
    let alive = true;
    listImoveis().then((list) => {
      if (!alive) return;
      setImoveis(list);
      // Análise offline síncrona com DEMO_CAMADAS — triagem instantânea sem rede.
      const rec: Record<string, AnaliseAmbiental> = {};
      const alt: Record<string, AlteracaoImovel> = {};
      for (const im of list) {
        if (im.geometry.points.length >= 3) {
          rec[im.id] = analisarSobreposicoes(
            im.geometry.points,
            DEMO_CAMADAS,
            'offline-demo',
          );
          // Delta de re-demarcação (anterior × atual) para o alerta de visita.
          const a = analisarAlteracaoImovel(im, DEMO_CAMADAS, 'offline-demo');
          if (a) alt[im.id] = a;
        }
      }
      setAnalises(rec);
      setAlteracoes(alt);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  const setValidacao = useCallback(
    async (im: Imovel, status: ValidacaoStatus) => {
      await updateImovel(im.id, {
        validacao: { status, analista: 'Analista', updatedAt: Date.now() },
      });
      load();
    },
    [load],
  );

  // Abre o imóvel e marca o informe de divergência como visto (some o selo "novo").
  const abrirImovel = useCallback(
    (im: Imovel) => {
      if (im.alertaDivergencia && !im.alertaDivergencia.visto) {
        updateImovel(im.id, {
          alertaDivergencia: { ...im.alertaDivergencia, visto: true },
        }).then(load);
      }
      navigate({ name: 'revisao', imovelId: im.id });
    },
    [navigate, load],
  );

  return (
    <Screen title="Triagem" subtitle="Imóveis recebidos · analisar e validar" showBack={false}>
      <FlatList
        data={imoveis}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <EmptyState
            title="Nada para validar"
            hint="Os imóveis cadastrados aparecem aqui para análise geométrica e aprovação."
          />
        }
        renderItem={({ item }) => {
          const v = validatePerimeter(item.geometry.points);
          const st = item.validacao?.status;
          const analise = analises[item.id];
          const temCritico =
            analise?.sobreposicoes.some((x) => x.severidade === 'critico') ?? false;
          const alt = alteracoes[item.id];
          const altVisita = alt?.relatorio.requerVisita ? alt : null;
          const decAlt = altVisita ? decisaoSugerida(altVisita.relatorio.severidade) : null;

          // Badge NOVO vem de alertaDivergencia (único campo com flag `visto`).
          const alertaNovo = item.alertaDivergencia != null && !item.alertaDivergencia.visto;

          // Cores do alerta unificado: derivam de decAlt quando disponível.
          const alertaBg = decAlt ? altBg[decAlt.tone] : '#fce8e7';
          const alertaBorderColor = decAlt ? altColor[decAlt.tone] : colors.critico;
          const alertaTextColor = decAlt ? altColor[decAlt.tone] : colors.critico;

          // Título e sub do alerta — altVisita tem precedência (mais detalhado).
          const alertaTitulo = altVisita
            ? `Alteração detectada — ${decAlt?.titulo.toLowerCase() ?? 'requer análise'}`
            : 'Divergência detectada — visita necessária';
          const alertaSub = altVisita
            ? `${altVisita.relatorio.delta_ha >= 0 ? '+' : ''}${altVisita.relatorio.delta_ha.toFixed(1)} ha (${altVisita.relatorio.delta_pct >= 0 ? '+' : ''}${altVisita.relatorio.delta_pct.toFixed(0)}%) · toque para detalhes →`
            : item.alertaDivergencia
            ? `${item.alertaDivergencia.delta_ha >= 0 ? '+' : ''}${item.alertaDivergencia.delta_ha.toFixed(1)} ha · toque para ver →`
            : '';

          return (
            <View style={s.card}>
              {/* Alerta unificado de topo — altVisita suprime alertaDivergencia (mesmo fato, mais rico) */}
              {(altVisita != null || item.alertaDivergencia != null) && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[s.alerta, { backgroundColor: alertaBg, borderColor: alertaBorderColor }]}
                  onPress={() =>
                    altVisita
                      ? navigate({ name: 'alteracao-detalhe', imovelId: item.id })
                      : abrirImovel(item)
                  }
                >
                  <View style={s.alertaHead}>
                    {alertaNovo && <Text style={s.alertaNovoBadge}>NOVO</Text>}
                    <Text style={[s.alertaTitulo, { color: alertaTextColor }]} numberOfLines={2}>
                      {alertaTitulo}
                    </Text>
                  </View>
                  {alertaSub.length > 0 && <Text style={s.alertaSub}>{alertaSub}</Text>}
                </TouchableOpacity>
              )}

              {/* Corpo — toque abre o imóvel na tela de revisão */}
              <TouchableOpacity activeOpacity={0.85} onPress={() => abrirImovel(item)}>
                <View style={s.head}>
                  <Text style={s.titulo} numberOfLines={1}>
                    {item.imovel.nome || 'Imóvel sem nome'}
                  </Text>
                  {st ? (
                    <Badge tone={st === 'aprovado' ? 'ok' : st === 'reprovado' ? 'aviso' : 'neutro'}>
                      {st === 'aprovado' ? 'Aprovado' : st === 'reprovado' ? 'Reprovado' : 'Pendente'}
                    </Badge>
                  ) : (
                    <Badge tone="neutro">Pendente</Badge>
                  )}
                </View>
                <Text style={s.sub} numberOfLines={1}>
                  {[item.imovel.municipio, item.imovel.uf].filter(Boolean).join(' · ') ||
                    'Sem localização'}
                  {'  ·  '}
                  {item.geometry.area_ha.toFixed(2)} ha · {item.geometry.points.length} vértices
                </Text>

                {/* Checagem geométrica */}
                {v.problemas.length > 0 ? (
                  v.problemas.map((p, idx) => (
                    <Text key={`p-${idx}`} style={s.problema}>
                      {'✕'} {p}
                    </Text>
                  ))
                ) : (
                  <Text style={s.ok}>{'✓'} Geometria válida</Text>
                )}
                {v.avisos.map((a, idx) => (
                  <Text key={`a-${idx}`} style={s.aviso}>
                    {'⚠'} {a}
                  </Text>
                ))}

                {/* Sobreposição como chips coloridos por severidade */}
                {analise && analise.sobreposicoes.length > 0 ? (
                  <View style={s.chips}>
                    <Text style={[s.chipsIcone, { color: temCritico ? colors.critico : colors.aviso }]}>
                      {temCritico ? '⛔' : '⚠'}
                    </Text>
                    {analise.sobreposicoes.map((x, idx) => (
                      <View
                        key={idx}
                        style={[s.chip, x.severidade === 'critico' ? s.chipCritico : s.chipAviso]}
                      >
                        <Text
                          style={[
                            s.chipText,
                            { color: x.severidade === 'critico' ? colors.critico : colors.aviso },
                          ]}
                        >
                          {tipoLabel(x.tipo)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : analise != null ? (
                  <Text style={s.overlayClear}>{'✓'} Sem sobreposição ambiental (demo)</Text>
                ) : null}

                {/* Conferência solicitada: chip inline, não banner */}
                {item.solicitacaoVisita && (
                  <View style={s.confChip}>
                    <Text style={s.confChipText}>
                      {'📍'} Conf. solicitada pelo produtor
                      {item.solicitacaoVisita.motivo === 'documentacao' ? ' (doc.)' : ' (nova medição)'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Divisor */}
              <View style={s.divider} />

              {/* Ações secundárias — menores, em linha, foco baixo */}
              <View style={s.secundarias}>
                <TouchableOpacity
                  style={s.secundariaBtn}
                  activeOpacity={0.8}
                  onPress={() => navigate({ name: 'conferencia-lab', imovelId: item.id })}
                >
                  <Text style={s.secundariaBtnText}>Nova medição {'→'}</Text>
                </TouchableOpacity>
                <View style={s.secundariaSep} />
                <TouchableOpacity
                  style={s.secundariaBtn}
                  activeOpacity={0.8}
                  onPress={() => navigate({ name: 'analise-ambiental', imovelId: item.id })}
                >
                  <Text style={s.secundariaBtnText}>Ver laudo {'→'}</Text>
                </TouchableOpacity>
              </View>

              {/* Decisão principal — foco visual máximo */}
              <View style={s.actions}>
                <SecondaryButton label="Reprovar" onPress={() => setValidacao(item, 'reprovado')} />
                <View style={{ width: 10 }} />
                <PrimaryButton
                  label="Aprovar"
                  onPress={() => setValidacao(item, 'aprovado')}
                  disabled={!v.ok}
                />
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { padding: 16, gap: 12, flexGrow: 1 },
  card: {
    backgroundColor: colors.branco,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  titulo: { flex: 1, fontSize: 16, fontFamily: fonts.extraBold, color: colors.inkText },
  sub: { fontSize: 12, fontFamily: fonts.regular, color: colors.mutedText, marginTop: 4 },
  ok: { fontSize: 13, fontFamily: fonts.bold, color: colors.primary, marginTop: 8 },
  problema: { fontSize: 13, fontFamily: fonts.bold, color: colors.critico, marginTop: 8, lineHeight: 18 },
  aviso: { fontSize: 12, fontFamily: fonts.regular, color: colors.aviso, marginTop: 4, lineHeight: 17 },
  overlayClear: { fontSize: 12, fontFamily: fonts.bold, color: colors.primary, marginTop: 8 },
  actions: { flexDirection: 'row', marginTop: 12 },

  // Alerta unificado de topo (altVisita suprime alertaDivergencia — mesmo fato)
  alerta: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  alertaHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertaNovoBadge: {
    fontSize: 10,
    fontFamily: fonts.extraBold,
    color: colors.branco,
    backgroundColor: colors.critico,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  alertaTitulo: { flex: 1, fontSize: 13, fontFamily: fonts.extraBold, lineHeight: 17 },
  alertaSub: { fontSize: 11, fontFamily: fonts.regular, color: colors.mutedText, marginTop: 3, lineHeight: 15 },

  // Chips de sobreposição ambiental
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  chipsIcone: { fontSize: 13, fontFamily: fonts.bold },
  chip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  chipCritico: { backgroundColor: '#fce8e7', borderColor: colors.critico },
  chipAviso: { backgroundColor: '#fdf4e3', borderColor: '#c07a1a' },
  chipText: { fontSize: 11, fontFamily: fonts.extraBold },

  // Conferência solicitada — chip inline
  confChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#fdf4e3',
    borderWidth: 1,
    borderColor: '#c07a1a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  confChipText: { fontSize: 11, fontFamily: fonts.bold, color: colors.aviso },

  // Divisor visual entre corpo e ações
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 12 },

  // Ações secundárias — linha única, menor destaque visual
  secundarias: { flexDirection: 'row', marginBottom: 4 },
  secundariaBtn: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  secundariaBtnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.primary },
  secundariaSep: { width: 1, backgroundColor: colors.line, marginVertical: 4 },
});
