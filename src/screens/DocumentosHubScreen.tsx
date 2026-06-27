// Hub de Documentos — lista imóveis; toque → DocumentosScreen (por-imóvel).
// Compartilhado entre produtor e analista (ver Router.tsx, rota 'documentos-hub').
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { EmptyState } from '../ui';
import { colors } from '../theme/colors';
import { listImoveis } from '../lib/store';
import type { Imovel } from '../types';

export function DocumentosHubScreen() {
  const { navigate } = useNav();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);

  const load = useCallback(() => { listImoveis().then(setImoveis); }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <Screen title="Documentos" subtitle="Anexos por imóvel" showBack={false}>
      <FlatList
        data={imoveis}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <EmptyState
            title="Nenhum imóvel"
            hint="Os imóveis cadastrados aparecem aqui. Toque para gerenciar os documentos de cada um."
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.85}
            onPress={() => navigate({ name: 'documentos', imovelId: item.id })}
          >
            <Text style={s.nome} numberOfLines={1}>
              {item.imovel.nome || 'Imóvel sem nome'}
            </Text>
            <Text style={s.sub} numberOfLines={1}>
              {[item.imovel.municipio, item.imovel.uf].filter(Boolean).join(' · ') || 'Sem localização'}
            </Text>
            <Text style={s.docsCount}>
              {item.documentos.length} documento{item.documentos.length !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        )}
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
  nome:      { fontSize: 17, fontWeight: '800', color: colors.ink },
  sub:       { fontSize: 13, color: colors.muted, marginTop: 4 },
  docsCount: { fontSize: 12, fontWeight: '700', color: colors.verde, marginTop: 8 },
});
