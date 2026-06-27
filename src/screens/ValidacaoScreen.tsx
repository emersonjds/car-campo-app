// Aba "Validação" (analista) — revisa a geometria de cada imóvel e aprova/reprova.
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { Badge, EmptyState, PrimaryButton, SecondaryButton } from '../ui';
import { colors } from '../theme/colors';
import { listImoveis, updateImovel } from '../lib/store';
import { validatePerimeter } from '../lib/geo';
import { analisarSobreposicoes, type AnaliseAmbiental, type CamadaTipo } from '../lib/overlay';
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
    case 'car_vizinho':        return 'CAR viz.';
  }
}

export function ValidacaoScreen() {
  const { navigate } = useNav();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [analises, setAnalises] = useState<Record<string, AnaliseAmbiental>>({});

  const load = useCallback(() => {
    let alive = true;
    listImoveis().then((list) => {
      if (!alive) return;
      setImoveis(list);
      // Análise offline síncrona com DEMO_CAMADAS — triagem instantânea sem rede.
      const rec: Record<string, AnaliseAmbiental> = {};
      for (const im of list) {
        if (im.geometry.points.length >= 3) {
          rec[im.id] = analisarSobreposicoes(
            im.geometry.points,
            DEMO_CAMADAS,
            'offline-demo',
          );
        }
      }
      setAnalises(rec);
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

  return (
    <Screen title="Validação" subtitle="Análise geométrica dos imóveis" showBack={false}>
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
            analise != null &&
            analise.sobreposicoes.some((x) => x.severidade === 'critico');
          const sobreposicoesLabel =
            analise && analise.sobreposicoes.length > 0
              ? analise.sobreposicoes.map((x) => tipoLabel(x.tipo)).join(', ')
              : null;

          return (
            <View style={s.card}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => navigate({ name: 'revisao', imovelId: item.id })}
              >
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
                      ✕ {p}
                    </Text>
                  ))
                ) : (
                  <Text style={s.ok}>✓ Geometria válida</Text>
                )}
                {v.avisos.map((a, idx) => (
                  <Text key={`a-${idx}`} style={s.aviso}>
                    ⚠ {a}
                  </Text>
                ))}

                {/* Triagem ambiental do analista */}
                {sobreposicoesLabel != null ? (
                  <View
                    style={[
                      s.overlayBadge,
                      temCritico ? s.overlayBadgeCritico : s.overlayBadgeAviso,
                    ]}
                  >
                    <Text
                      style={[
                        s.overlayBadgeText,
                        { color: temCritico ? colors.alerta : colors.aviso },
                      ]}
                    >
                      {temCritico ? '⛔' : '⚠'} Sobreposição: {sobreposicoesLabel}
                    </Text>
                  </View>
                ) : analise != null ? (
                  <Text style={s.overlayClear}>✓ Sem sobreposição ambiental (demo)</Text>
                ) : null}
              </TouchableOpacity>

              {/* Laudo ambiental completo */}
              <TouchableOpacity
                style={s.laudoBtn}
                activeOpacity={0.8}
                onPress={() => navigate({ name: 'analise-ambiental', imovelId: item.id })}
              >
                <Text style={s.laudoBtnText}>Ver laudo ambiental completo</Text>
              </TouchableOpacity>

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
  titulo: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12, color: colors.muted, marginTop: 4 },
  ok: { fontSize: 13, color: colors.verde, fontWeight: '700', marginTop: 8 },
  problema: {
    fontSize: 13,
    color: colors.alerta,
    fontWeight: '700',
    marginTop: 8,
    lineHeight: 18,
  },
  aviso: { fontSize: 12, color: colors.aviso, marginTop: 4, lineHeight: 17 },

  // Triagem ambiental
  overlayBadge: {
    marginTop: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  overlayBadgeCritico: {
    backgroundColor: '#fce8e7',
    borderColor: colors.alerta,
  },
  overlayBadgeAviso: {
    backgroundColor: '#fdf4e3',
    borderColor: '#c07a1a',
  },
  overlayBadgeText: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  overlayClear: {
    fontSize: 12,
    color: colors.verde,
    fontWeight: '700',
    marginTop: 8,
  },

  // Botão de laudo
  laudoBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.verdeBg,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  laudoBtnText: { fontSize: 13, fontWeight: '700', color: colors.verde },

  actions: { flexDirection: 'row', marginTop: 12 },
});
