// Notificações — central de Alertas de Divergência do analista.
// Lista TODOS os imóveis com alertaDivergencia (antes só o #1 aparecia no Painel).
// Offline-first: lê o store local; sem motores pesados aqui.
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { colors } from '../theme/colors';
import { listImoveis } from '../lib/store';
import type { Imovel } from '../types';

const PESO_SEV: Record<string, number> = { critico: 3, alto: 2, medio: 1, baixo: 0 };

export function NotificacoesScreen() {
  const { navigate } = useNav();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);

  useEffect(() => {
    listImoveis().then(setImoveis);
  }, []);

  // Mesma ordenação do Painel: crítico primeiro, depois maior delta_pct absoluto.
  const alertas = useMemo(
    () =>
      imoveis
        .filter((i) => i.alertaDivergencia)
        .sort((a, b) => {
          const ds =
            (PESO_SEV[b.alertaDivergencia!.severidade] ?? 0) -
            (PESO_SEV[a.alertaDivergencia!.severidade] ?? 0);
          return ds !== 0
            ? ds
            : Math.abs(b.alertaDivergencia!.delta_pct) - Math.abs(a.alertaDivergencia!.delta_pct);
        }),
    [imoveis],
  );

  const subtitulo =
    alertas.length > 0
      ? `${alertas.length} alerta${alertas.length !== 1 ? 's' : ''} de divergência`
      : 'Sem alertas no momento';

  return (
    <Screen title="Notificações" subtitle={subtitulo}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {alertas.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="notifications-off-outline" size={40} color={colors.mutedText} />
            <Text style={s.emptyText}>Nenhuma divergência pendente.</Text>
          </View>
        ) : (
          alertas.map((im) => (
            <View key={im.id} style={s.cardAlertas}>
              <View style={s.alertasTop}>
                <View style={s.alertasIconBox}>
                  <Ionicons name="alert-circle-outline" size={20} color={colors.critico} />
                </View>
              </View>
              <Text style={s.alertasTitle}>Alerta de Divergência</Text>
              <Text style={s.alertasDesc}>
                {'Divergência detectada na '}
                <Text style={s.bold}>{im.imovel.nome}</Text>
                {' (Produtor: '}
                {im.produtor.nome}
                {'). Diferença de '}
                <Text style={s.bold}>{Math.abs(im.alertaDivergencia!.delta_pct).toFixed(0)}% vs INCRA</Text>
                {'.'}
              </Text>
              <TouchableOpacity
                style={s.btnAgendarVisita}
                onPress={() => navigate({ name: 'visitas' })}
                activeOpacity={0.85}
              >
                <Ionicons name="calendar-outline" size={16} color={colors.branco} />
                <Text style={s.btnAgendarVisitaText}>Agendar Visita Técnica</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnVerDetalhes}
                onPress={() => navigate({ name: 'alteracao-detalhe', imovelId: im.id })}
                activeOpacity={0.85}
              >
                <Text style={s.btnVerDetalhesText}>Ver Detalhes do Lote</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

// Estilos do card replicam o antigo "Alertas de Divergência" do Painel.
const s = StyleSheet.create({
  content: { padding: 16, paddingBottom: 28 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: colors.mutedText },

  cardAlertas: {
    backgroundColor: '#fbeae9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f0c4c2',
    padding: 16,
    marginBottom: 14,
  },
  alertasTop: { marginBottom: 10 },
  alertasIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f8d7d6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertasTitle: { fontSize: 15, fontWeight: '800', color: colors.critico, marginBottom: 6 },
  alertasDesc: { fontSize: 14, color: colors.critico, lineHeight: 20, marginBottom: 14 },
  bold: { fontWeight: '800' },
  btnAgendarVisita: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.critico,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 10,
  },
  btnAgendarVisitaText: { fontSize: 15, fontWeight: '800', color: colors.branco },
  btnVerDetalhes: {
    borderWidth: 1.5,
    borderColor: colors.critico,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnVerDetalhesText: { fontSize: 15, fontWeight: '700', color: colors.critico },
});
