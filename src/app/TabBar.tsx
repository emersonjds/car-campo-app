// Barra de navegação inferior. As abas mudam conforme o perfil:
//  • Produtor rural: Imóveis · Perfil
//  • Analista de campo: Imóveis · Validação · Painel · Perfil
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { useNav, type Route, type RouteName } from './navigation';
import type { Perfil } from '../types';

interface Tab {
  route: Route;
  name: RouteName;
  icon: string;
  label: string;
}

const TABS_PRODUTOR: Tab[] = [
  { route: { name: 'home' }, name: 'home', icon: '🗺️', label: 'Imóveis' },
  { route: { name: 'config' }, name: 'config', icon: '👤', label: 'Perfil' },
];

const TABS_ANALISTA: Tab[] = [
  { route: { name: 'home' }, name: 'home', icon: '🗺️', label: 'Imóveis' },
  { route: { name: 'validacao' }, name: 'validacao', icon: '✅', label: 'Validação' },
  { route: { name: 'painel' }, name: 'painel', icon: '📊', label: 'Painel' },
  { route: { name: 'config' }, name: 'config', icon: '👤', label: 'Perfil' },
];

export function tabsForPerfil(perfil: Perfil | null): Tab[] {
  return perfil === 'analista' ? TABS_ANALISTA : TABS_PRODUTOR;
}

export function TabBar() {
  const { route, perfil, switchTab } = useNav();
  const tabs = tabsForPerfil(perfil);

  return (
    <View style={s.bar}>
      {tabs.map((tab) => {
        const active = route.name === tab.name;
        return (
          <TouchableOpacity
            key={tab.name}
            style={s.tab}
            onPress={() => !active && switchTab(tab.route)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
          >
            <Text style={[s.icon, active && s.iconActive]}>{tab.icon}</Text>
            <Text style={[s.label, active && s.labelActive]}>{tab.label}</Text>
            {active && <View style={s.dot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.branco,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
    paddingBottom: 26, // espaço para o indicador de home (safe area iOS)
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 22, opacity: 0.55 },
  iconActive: { opacity: 1 },
  label: { fontSize: 11, color: colors.muted, marginTop: 2, fontWeight: '600' },
  labelActive: { color: colors.verde, fontWeight: '800' },
  dot: {
    position: 'absolute',
    top: 0,
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.verde,
  },
});
