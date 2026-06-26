// "Meus imóveis" — lista offline (rascunho/enviado). Ponto de entrada do app.
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { Badge, EmptyState } from '../ui';
import { colors } from '../theme/colors';
import { deleteImovel, listImoveis } from '../lib/store';
import type { Imovel } from '../types';

export function HomeScreen() {
  const { navigate, perfil } = useNav();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);

  const load = useCallback(() => {
    listImoveis().then(setImoveis);
  }, []);
  // O Router só monta a rota ativa, então Home remonta ao voltar — basta o efeito de montagem.
  useEffect(() => load(), [load]);

  function confirmDelete(im: Imovel) {
    Alert.alert('Excluir imóvel', `Remover "${im.imovel.nome || 'sem nome'}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => deleteImovel(im.id).then(load) },
    ]);
  }

  return (
    <Screen
      title={perfil === 'analista' ? 'Imóveis' : 'Meus imóveis'}
      subtitle={perfil === 'analista' ? 'Todos os imóveis · Analista de campo' : 'Produtor rural'}
      showBack={false}
    >
      <FlatList
        data={imoveis}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <EmptyState
            title="Nenhum imóvel ainda"
            hint="Toque em “Novo imóvel” para cadastrar e desenhar o perímetro caminhando — ou simulando a caminhada."
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.85}
            onPress={() => navigate({ name: 'cadastro', imovelId: item.id })}
            onLongPress={() => confirmDelete(item)}
          >
            <View style={s.cardHead}>
              <Text style={s.cardTitle} numberOfLines={1}>
                {item.imovel.nome || 'Imóvel sem nome'}
              </Text>
              <Badge tone={item.status === 'enviado' ? 'ok' : 'aviso'}>
                {item.status === 'enviado' ? 'Enviado' : 'Rascunho'}
              </Badge>
            </View>
            <Text style={s.cardSub} numberOfLines={1}>
              {[item.imovel.municipio, item.imovel.uf].filter(Boolean).join(' · ') || 'Sem localização'}
            </Text>
            <View style={s.metaRow}>
              <Text style={s.meta}>{item.geometry.area_ha.toFixed(2)} ha</Text>
              <Text style={s.meta}>{item.geometry.points.length} vértices</Text>
              <Text style={s.meta}>{item.documentos.length} docs</Text>
            </View>
          </TouchableOpacity>
        )}
      />
      {/* Botão flutuante de novo imóvel (acima da barra de navegação). */}
      <TouchableOpacity
        style={s.fab}
        activeOpacity={0.9}
        onPress={() => navigate({ name: 'cadastro' })}
        accessibilityRole="button"
        accessibilityLabel="Novo imóvel"
      >
        <Text style={s.fabText}>＋ Novo imóvel</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { padding: 16, paddingBottom: 96, gap: 12, flexGrow: 1 },
  card: { backgroundColor: colors.branco, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.ink },
  cardSub: { fontSize: 13, color: colors.muted, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 14, marginTop: 10 },
  meta: { fontSize: 12, fontWeight: '700', color: colors.verde },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: colors.verde,
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 6,
  },
  fabText: { color: colors.branco, fontWeight: '800', fontSize: 16 },
});
