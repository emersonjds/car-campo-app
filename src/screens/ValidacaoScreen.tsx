// Aba "Validação" (analista) — revisa a geometria de cada imóvel e aprova/reprova.
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { Badge, EmptyState, PrimaryButton, SecondaryButton } from '../ui';
import { colors } from '../theme/colors';
import { listImoveis, updateImovel } from '../lib/store';
import { validatePerimeter } from '../lib/geo';
import type { Imovel, ValidacaoStatus } from '../types';

export function ValidacaoScreen() {
  const { navigate } = useNav();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);

  const load = useCallback(() => {
    listImoveis().then(setImoveis);
  }, []);
  useEffect(() => load(), [load]);

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
                  {[item.imovel.municipio, item.imovel.uf].filter(Boolean).join(' · ') || 'Sem localização'}
                  {'  ·  '}
                  {item.geometry.area_ha.toFixed(2)} ha · {item.geometry.points.length} vértices
                </Text>

                {/* Resultado da checagem geométrica */}
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
  card: { backgroundColor: colors.branco, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  titulo: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12, color: colors.muted, marginTop: 4 },
  ok: { fontSize: 13, color: colors.verde, fontWeight: '700', marginTop: 8 },
  problema: { fontSize: 13, color: colors.alerta, fontWeight: '700', marginTop: 8, lineHeight: 18 },
  aviso: { fontSize: 12, color: colors.aviso, marginTop: 4, lineHeight: 17 },
  actions: { flexDirection: 'row', marginTop: 14 },
});
