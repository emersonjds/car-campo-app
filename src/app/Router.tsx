import { ActivityIndicator, View } from 'react-native';
import { colors } from '../theme/colors';
import { useNav } from './navigation';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MedicoesScreen } from '../screens/MedicoesScreen';
import { DocumentosHubScreen } from '../screens/DocumentosHubScreen';
import { ImovelDetalheScreen } from '../screens/ImovelDetalheScreen';
import { SelecionarImovelScreen } from '../screens/SelecionarImovelScreen';
import { CadastroScreen } from '../screens/CadastroScreen';
import { DemarcacaoScreen } from '../screens/DemarcacaoScreen';
import { DocumentosScreen } from '../screens/DocumentosScreen';
import { RevisaoScreen } from '../screens/RevisaoScreen';
import { AnaliseAmbientalScreen } from '../screens/AnaliseAmbientalScreen';
import { VisitasScreen } from '../screens/VisitasScreen';
import { AlteracaoDetalheScreen } from '../screens/AlteracaoDetalheScreen';
import { AgendarVisitaScreen } from '../screens/AgendarVisitaScreen';
import { NotificacoesScreen } from '../screens/NotificacoesScreen';
import { ConfigScreen } from '../screens/ConfigScreen';

export function Router() {
  const { route, ready } = useNav();
  const { sessao } = useAuth();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.verdeBg }}>
        <ActivityIndicator color={colors.verde} />
      </View>
    );
  }

  if (!sessao) {
    return <LoginScreen />;
  }

  switch (route.name) {
    case 'dashboard':
      return <HomeScreen />;
    case 'medicoes':
      return <MedicoesScreen />;
    case 'documentos-hub':
      return <DocumentosHubScreen />;
    case 'perfil':
      return <ConfigScreen />;
    case 'home':
      return <HomeScreen />;
    case 'visitas':
      return <VisitasScreen />;
    case 'notificacoes':
      return <NotificacoesScreen />;
    case 'config':
      return <ConfigScreen />;
    case 'imovel-detalhe':
      return <ImovelDetalheScreen imovelId={route.imovelId} />;
    case 'selecionar-imovel':
      return <SelecionarImovelScreen />;
    case 'cadastro':
      return <CadastroScreen imovelId={route.imovelId} />;
    case 'demarcacao':
      return <DemarcacaoScreen imovelId={route.imovelId} />;
    case 'documentos':
      return <DocumentosScreen imovelId={route.imovelId} />;
    case 'revisao':
      return <RevisaoScreen imovelId={route.imovelId} />;
    case 'analise-ambiental':
      return <AnaliseAmbientalScreen imovelId={route.imovelId} />;
    case 'alteracao-detalhe':
      return <AlteracaoDetalheScreen imovelId={route.imovelId} />;
    case 'agendar-visita':
      return <AgendarVisitaScreen imovelId={route.imovelId} />;
    default:
      return <HomeScreen />;
  }
}
