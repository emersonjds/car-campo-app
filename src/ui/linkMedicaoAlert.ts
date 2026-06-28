import { Alert, Linking, Share } from 'react-native';
import type { LinkMedicao } from '../lib/export';

/**
 * Mostra o resultado da geração do link da medição: código curto + onde
 * consultar na web (CPF + código), com opções de abrir o documento ou
 * compartilhar. Usado pela Revisão e pela tela de Documentos.
 */
export function mostrarLinkMedicao(link: LinkMedicao): void {
  const msg = link.codigo
    ? `Código: ${link.codigo}\n\nNa web, abra ${link.consultaUrl} e informe seu CPF + este código para ver a medição.`
    : link.viewUrl;
  Alert.alert('Medição na web', msg, [
    { text: 'Abrir documento', onPress: () => Linking.openURL(link.viewUrl) },
    {
      text: 'Compartilhar',
      onPress: () =>
        Share.share({
          message: link.codigo
            ? `Medição CAR Campo\nCódigo: ${link.codigo}\nConsulta: ${link.consultaUrl} (informe seu CPF + o código)\nDocumento: ${link.viewUrl}`
            : link.viewUrl,
        }),
    },
    { text: 'Fechar', style: 'cancel' },
  ]);
}
