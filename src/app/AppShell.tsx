// Casca do app: renderiza a tela ativa e, quando estamos numa aba de topo,
// mostra a barra de navegação inferior. Durante o wizard (cadastro→revisão)
// a barra some e o botão "voltar" do cabeçalho assume.
import { View } from 'react-native';
import { Router } from './Router';
import { TabBar } from './TabBar';
import { isTabRoot, useNav } from './navigation';

export function AppShell() {
  const { route, perfil, ready } = useNav();
  const showTabBar = ready && !!perfil && isTabRoot(route.name);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Router />
      </View>
      {showTabBar && <TabBar />}
    </View>
  );
}
