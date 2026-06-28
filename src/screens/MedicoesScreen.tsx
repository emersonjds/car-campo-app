// Analista cai em ValidacaoScreen pela mesma rota 'medicoes' (ver Router.tsx).
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { EmptyState, FAB } from '../ui';
import { colors } from '../theme/colors';
import { listImoveis } from '../lib/store';
import type { Imovel } from '../types';

export function MedicoesScreen() {
  const { navigate } = useNav();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);

  const load = useCallback(() => { listImoveis().then(setImoveis); }, []);
  // Remonta ao voltar (Router remonta a rota ativa) — efeito de montagem basta.
  useEffect(() => { load(); }, [load]);

  function abrirImovel(im: Imovel) {
    navigate(
      im.geometry.points.length >= 3
        ? { name: 'revisao',    imovelId: im.id }
        : { name: 'demarcacao', imovelId: im.id },
    );
  }

  return (
    <Screen title="Medições" subtitle="Seus imóveis demarcados" showBack={false}>
      <FlatList
        data={imoveis}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <EmptyState
            title="Nenhuma medição ainda"
            hint="Toque no botão + para iniciar uma nova medição e demarcar o perímetro do imóvel."
          />
        }
        renderItem={({ item }) => <ImovelCard item={item} onPress={() => abrirImovel(item)} />}
      />
      <FAB onPress={() => navigate({ name: 'cadastro' })} />
    </Screen>
  );
}

function ImovelCard({ item, onPress }: { item: Imovel; onPress: () => void }) {
  const temPerimetro = item.geometry.points.length >= 3;
  return (
    <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={onPress}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle} numberOfLines={1}>
          {item.imovel.nome || 'Imóvel sem nome'}
        </Text>
        <Text style={[s.badge, temPerimetro ? s.badgeOk : s.badgePending]}>
          {temPerimetro ? 'Perímetro OK' : 'Demarcar'}
        </Text>
      </View>
      <Text style={s.cardSub} numberOfLines={1}>
        {[item.imovel.municipio, item.imovel.uf].filter(Boolean).join(' · ') || 'Sem localização'}
      </Text>
      <View style={s.metaRow}>
        <Text style={s.meta}>{item.geometry.area_ha.toFixed(2)} ha</Text>
        <Text style={s.meta}>{item.geometry.points.length} vértices</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  list: { padding: 16, paddingBottom: 96, gap: 12, flexGrow: 1 },
  card: {
    backgroundColor: colors.branco,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.ink },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    overflow: 'hidden',
  },
  badgeOk:      { backgroundColor: '#e2f3e8', color: colors.verde },
  badgePending: { backgroundColor: colors.verdeBg, color: colors.muted },
  cardSub: { fontSize: 13, color: colors.muted, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 14, marginTop: 10 },
  meta: { fontSize: 12, fontWeight: '700', color: colors.verde },
});
