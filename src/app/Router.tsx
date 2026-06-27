// Renderiza a tela ativa a partir da rota. Cada tela é independente e carrega
// seus próprios dados do store pelo imovelId.
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../theme/colors';
import { useNav } from './navigation';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MedicoesScreen } from '../screens/MedicoesScreen';
import { DocumentosHubScreen } from '../screens/DocumentosHubScreen';
import { CadastroScreen } from '../screens/CadastroScreen';
import { DemarcacaoScreen } from '../screens/DemarcacaoScreen';
import { DocumentosScreen } from '../screens/DocumentosScreen';
import { RevisaoScreen } from '../screens/RevisaoScreen';
import { AnaliseAmbientalScreen } from '../screens/AnaliseAmbientalScreen';
import { ValidacaoScreen } from '../screens/ValidacaoScreen';
import { VisitasScreen } from '../screens/VisitasScreen';
import { AlteracaoDetalheScreen } from '../screens/AlteracaoDetalheScreen';
import { ConferenciaLabScreen } from '../screens/ConferenciaLabScreen';
import { AgendarVisitaScreen } from '../screens/AgendarVisitaScreen';
import { PainelScreen } from '../screens/PainelScreen';
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
    // ── Abas v2 ──────────────────────────────────────────────────────────────
    case 'dashboard':
      return <HomeScreen />;
    case 'medicoes':
      // ponytail: mesma rota, tela diferente por perfil — evita rota duplicada.
      return sessao.perfil === 'analista' ? <ValidacaoScreen /> : <MedicoesScreen />;
    case 'documentos-hub':
      return <DocumentosHubScreen />;
    case 'perfil':
      return <ConfigScreen />;
    // ── Abas legadas ─────────────────────────────────────────────────────────
    case 'home':
      return <HomeScreen />;
    case 'validacao':
      return <ValidacaoScreen />;
    case 'visitas':
      return <VisitasScreen />;
    case 'painel':
      return <PainelScreen />;
    case 'config':
      return <ConfigScreen />;
    // ── Wizard / detalhe ─────────────────────────────────────────────────────
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
    case 'conferencia-lab':
      return <ConferenciaLabScreen imovelId={route.imovelId} />;
    case 'agendar-visita':
      return <AgendarVisitaScreen imovelId={route.imovelId} />;
    default:
      return <HomeScreen />;
  }
}
