// Hub de Documentos — lista imóveis com Card visual v2.
// Toque → DocumentosScreen (detalhe por-imóvel). Rota 'documentos-hub'.
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { Card, EmptyState, StatusChip } from '../ui';
import { colors } from '../theme/colors';
import { listImoveis } from '../lib/store';
import type { Imovel } from '../types';

// ponytail: chip status derivado inline — evita import de tipo não exportado
type ChipStatus = 'regularizado' | 'critico' | 'aviso' | 'info';

function cardChip(im: Imovel): { status: ChipStatus; label: string } {
  const v = im.validacao?.status;
  if (v === 'aprovado') return { status: 'regularizado', label: 'Validado' };
  if (v === 'reprovado') return { status: 'critico', label: 'Reprovado' };
  if (im.status === 'enviado') return { status: 'info', label: 'Enviado' };
  return { status: 'aviso', label: 'Rascunho' };
}

export function DocumentosHubScreen() {
  const { navigate } = useNav();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);

  const load = useCallback(() => {
    listImoveis().then(setImoveis);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen title="Documentos" subtitle="Imóveis e documentos CAR" showBack={false}>
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
        renderItem={({ item }) => {
          const chip = cardChip(item);
          const area =
            item.geometry.points.length >= 3
              ? `${item.geometry.area_ha.toFixed(2)} ha`
              : null;
          const localizacao =
            [item.imovel.municipio, item.imovel.uf].filter(Boolean).join(' · ') ||
            'Sem localização';
          const docCount = item.documentos.length;

          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigate({ name: 'documentos', imovelId: item.id })}
              accessibilityRole="button"
              accessibilityLabel={`Documentos de ${item.imovel.nome || 'imóvel sem nome'}`}
            >
              <Card style={s.card}>
                {/* Nome + chip */}
                <View style={s.cardHeader}>
                  <Text style={s.nome} numberOfLines={1}>
                    {item.imovel.nome || 'Imóvel sem nome'}
                  </Text>
                  <StatusChip status={chip.status} label={chip.label} />
                </View>

                {/* Localização */}
                <Text style={s.sub} numberOfLines={1}>
                  {localizacao}
                </Text>

                {/* Rodapé do card: docs + área */}
                <View style={s.cardFooter}>
                  <View style={s.docsBadge}>
                    <Text style={s.docsCount}>
                      {docCount} doc{docCount !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  {area ? <Text style={s.area}>{area}</Text> : null}
                </View>
              </Card>
            </TouchableOpacity>
          );
        }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { padding: 16, gap: 12, flexGrow: 1 },

  card: { gap: 6 },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  nome: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: colors.inkText,
  },

  sub: { fontSize: 13, color: colors.mutedText },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  docsBadge: {
    backgroundColor: colors.verdeBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  docsCount: { fontSize: 12, fontWeight: '700', color: colors.primary },
  area: { fontSize: 13, fontWeight: '700', color: colors.mutedText },
});
