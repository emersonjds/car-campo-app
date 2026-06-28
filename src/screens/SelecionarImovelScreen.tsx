// Tela intermediária: produtor escolhe qual propriedade vai (re)medir.
// Exibida quando o usuário toca "Iniciar Nova Medição" e já tem >1 imóvel.
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { Card } from '../ui';
import { colors } from '../theme/colors';
import { text } from '../theme/typography';
import { listImoveis } from '../lib/store';
import type { Imovel } from '../types';

export function SelecionarImovelScreen() {
  const { navigate } = useNav();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);

  const load = useCallback(() => {
    listImoveis().then(setImoveis);
  }, []);
  useEffect(() => load(), [load]);

  return (
    <Screen title="Nova Medição" subtitle="Escolha a propriedade">
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {imoveis.map((im) => (
          <TouchableOpacity
            key={im.id}
            activeOpacity={0.85}
            onPress={() => navigate({ name: 'cadastro', imovelId: im.id })}
            accessibilityRole="button"
            accessibilityLabel={`Selecionar ${im.imovel.nome}`}
          >
            <Card style={s.card}>
              <View style={s.row}>
                <View style={s.info}>
                  <Text style={s.nome} numberOfLines={2}>{im.imovel.nome}</Text>
                  <Text style={s.loc}>
                    {[im.imovel.municipio, im.imovel.uf].filter(Boolean).join(', ')}
                  </Text>
                  <View style={s.metaRow}>
                    <View style={s.hectaresBox}>
                      <Text style={s.hectaresVal}>{Math.round(im.geometry.area_ha)}</Text>
                      <Text style={s.hectaresUnit}> ha</Text>
                    </View>
                    <Text style={s.carNum}>CAR: {im.imovel.carNumero ?? '—'}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.mutedText} />
              </View>
            </Card>
          </TouchableOpacity>
        ))}

        {/* Opção de cadastro de imóvel novo */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigate({ name: 'cadastro' })}
          accessibilityRole="button"
          accessibilityLabel="Cadastrar novo imóvel"
        >
          <Card style={[s.card, s.newCard]}>
            <View style={s.row}>
              <View style={s.newIcon}>
                <Ionicons name="add" size={22} color={colors.branco} />
              </View>
              <Text style={s.newLabel}>Cadastrar novo imóvel</Text>
              <Ionicons name="chevron-forward" size={22} color={colors.mutedText} />
            </View>
          </Card>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32 },

  card: { marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1 },
  nome: { ...text.bodySemibold, fontSize: 16, color: colors.inkText },
  loc: { ...text.caption, color: colors.mutedText, marginTop: 2 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  hectaresBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.verdeBg,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  hectaresVal:  { fontSize: 15, fontWeight: '800', color: colors.inkText },
  hectaresUnit: { ...text.caption, color: colors.mutedText },
  carNum: { ...text.caption, color: colors.mutedText },

  // Card "Cadastrar novo"
  newCard: { borderStyle: 'dashed', borderColor: colors.primary },
  newIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newLabel: { ...text.bodySemibold, color: colors.primary, flex: 1 },
});
