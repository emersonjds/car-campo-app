// Renderiza a tela ativa a partir da rota. Cada tela é independente e carrega
// seus próprios dados do store pelo imovelId.
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../theme/colors';
import { useNav } from './navigation';
import { PerfilScreen } from '../screens/PerfilScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { CadastroScreen } from '../screens/CadastroScreen';
import { DemarcacaoScreen } from '../screens/DemarcacaoScreen';
import { DocumentosScreen } from '../screens/DocumentosScreen';
import { RevisaoScreen } from '../screens/RevisaoScreen';
import { ValidacaoScreen } from '../screens/ValidacaoScreen';
import { PainelScreen } from '../screens/PainelScreen';
import { ConfigScreen } from '../screens/ConfigScreen';

export function Router() {
  const { route, ready } = useNav();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.verdeBg }}>
        <ActivityIndicator color={colors.verde} />
      </View>
    );
  }

  switch (route.name) {
    case 'perfil':
      return <PerfilScreen />;
    case 'home':
      return <HomeScreen />;
    case 'validacao':
      return <ValidacaoScreen />;
    case 'painel':
      return <PainelScreen />;
    case 'config':
      return <ConfigScreen />;
    case 'cadastro':
      return <CadastroScreen imovelId={route.imovelId} />;
    case 'demarcacao':
      return <DemarcacaoScreen imovelId={route.imovelId} />;
    case 'documentos':
      return <DocumentosScreen imovelId={route.imovelId} />;
    case 'revisao':
      return <RevisaoScreen imovelId={route.imovelId} />;
    default:
      return <HomeScreen />;
  }
}
