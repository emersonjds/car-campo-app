// Pré-visualização do documento preliminar dentro do app (WebView, offline).
// Renderiza o mesmo HTML do PDF — sem salvar, sem imprimir, sem rede.
import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { documentoHTML, documentoHTMLComSatelite } from '../lib/export';
import { colors } from '../theme/colors';
import type { Imovel } from '../types';

export function DocumentoPreviewModal({
  imovel,
  visible,
  onClose,
}: {
  imovel: Imovel | null;
  visible: boolean;
  onClose: () => void;
}) {
  // Esquemático na hora (offline); troca pelo croqui com satélite quando carregar.
  const [html, setHtml] = useState('');
  useEffect(() => {
    if (!visible || !imovel) return;
    let alive = true;
    setHtml(documentoHTML(imovel));
    documentoHTMLComSatelite(imovel).then((h) => {
      if (alive) setHtml(h);
    });
    return () => {
      alive = false;
    };
  }, [visible, imovel]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>Documento preliminar</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Fechar pré-visualização"
          >
            <Ionicons name="close" size={26} color={colors.inkText} />
          </TouchableOpacity>
        </View>
        {visible && imovel && html ? (
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            style={s.web}
            showsVerticalScrollIndicator
          />
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.branco },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { fontSize: 16, fontWeight: '800', color: colors.inkText },
  web: { flex: 1, backgroundColor: colors.branco },
});
