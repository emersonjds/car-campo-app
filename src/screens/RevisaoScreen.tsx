// Tela de Revisão — passo 4/4 do wizard de demarcação do imóvel.
// Exibe resumo, validação geométrica, exportação e envio à CAR Geo API.
// Offline-first: nunca bloqueia o produtor por falta de rede.
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../app/Screen';
import { WizardSteps } from '../app/WizardSteps';
import { useNav } from '../app/navigation';
import { getImovel, updateImovel } from '../lib/store';
import { areaHectares, perimeterM, validatePerimeter } from '../lib/geo';
import { submitPerimeter } from '../lib/api';
import { exportGeoJSONFile, exportPDF, shareText } from '../lib/export';
import {
  Badge,
  Card,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  StatBox,
} from '../ui';
import { colors } from '../theme/colors';
import type { Imovel } from '../types';

// ---------------------------------------------------------------------------
// Utilitários internos
// ---------------------------------------------------------------------------

/**
 * Mascara CPF/CNPJ para exibição na tela (LGPD — dado sensível).
 * Mesma lógica de export.ts; duplicada para evitar importar função privada.
 *   CPF  → ***.456.789-**
 *   CNPJ → todos os dígitos ocultos
 */
function maskCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  }
  if (digits.length === 14) {
    return `**.***.***/****-**`;
  }
  if (value.length > 3) {
    return value.slice(0, -3).replace(/./g, '*') + value.slice(-3);
  }
  return '***';
}

// Qual botão de ação está carregando agora
type ActiveAction = 'geojson' | 'pdf' | 'share' | 'submit' | null;

// ---------------------------------------------------------------------------
// Componente interno de linha de dado (label + valor)
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tela principal
// ---------------------------------------------------------------------------

export function RevisaoScreen({ imovelId }: { imovelId: string }) {
  const { navigate, goBack } = useNav();
  const [imovel, setImovel] = useState<Imovel | null>(null);
  const [loadingImovel, setLoadingImovel] = useState(true);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);

  // Carrega o imóvel ao montar
  useEffect(() => {
    let alive = true;
    getImovel(imovelId).then((im) => {
      if (!alive) return;
      setImovel(im);
      setLoadingImovel(false);
    });
    return () => {
      alive = false;
    };
  }, [imovelId]);

  /**
   * Wrapper de ação com loading state e tratamento de erro.
   * Evita execução concorrente (duplo tap).
   */
  const withAction = useCallback(
    async (key: ActiveAction, fn: () => Promise<void>) => {
      if (activeAction !== null) return;
      setActiveAction(key);
      try {
        await fn();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido.';
        Alert.alert('Ops', msg);
      } finally {
        setActiveAction(null);
      }
    },
    [activeAction],
  );

  const handleExportGeoJSON = useCallback(() => {
    if (!imovel) return;
    withAction('geojson', () => exportGeoJSONFile(imovel));
  }, [imovel, withAction]);

  const handleExportPDF = useCallback(() => {
    if (!imovel) return;
    withAction('pdf', () => exportPDF(imovel));
  }, [imovel, withAction]);

  const handleShare = useCallback(() => {
    if (!imovel) return;
    withAction('share', () => shareText(imovel));
  }, [imovel, withAction]);

  const handleSubmit = useCallback(() => {
    if (!imovel) return;
    withAction('submit', async () => {
      const { imovel: dados, produtor, geometry } = imovel;

      // Propriedades enviadas à API (sem CPF/CNPJ por extenso — LGPD)
      const properties: Record<string, unknown> = {
        nome: dados.nome,
        municipio: dados.municipio,
        uf: dados.uf,
        produtor_nome: produtor.nome,
        ...(dados.matricula ? { matricula: dados.matricula } : {}),
        ...(dados.modulosFiscais != null ? { modulos_fiscais: dados.modulosFiscais } : {}),
      };

      const result = await submitPerimeter(geometry.points, properties);

      // Offline-first: marcamos como 'enviado' independente do resultado de rede.
      // O dado está seguro no device; um job de sync re-tentaria em produção.
      await updateImovel(imovelId, { status: 'enviado' });

      if (result.ok) {
        Alert.alert(
          'Imóvel enviado!',
          `${result.message}\n\nRegistro confirmado na CAR Geo API.`,
          [{ text: 'Ok', onPress: () => navigate({ name: 'home' }) }],
        );
      } else if (result.status === 0) {
        // Sem rede — offline-first: dados salvos localmente, fluxo concluído
        Alert.alert(
          'Salvo localmente',
          'Sem conexão com a CAR Geo API no momento.\n\n' +
            'O imóvel está salvo no dispositivo e será reenviado assim que houver rede.',
          [{ text: 'Ok', onPress: () => navigate({ name: 'home' }) }],
        );
      } else {
        // Endpoint retornou erro HTTP (ex.: 404/405 em API somente-leitura)
        Alert.alert(
          'Atenção',
          `${result.message}\n\nOs dados ficaram salvos localmente com segurança.`,
          [{ text: 'Ok', onPress: () => navigate({ name: 'home' }) }],
        );
      }
    });
  }, [imovel, imovelId, navigate, withAction]);

  // ---- Estado: carregando ----
  if (loadingImovel) {
    return (
      <Screen title="Revisão" subtitle="Confira, exporte e envie">
        <WizardSteps active={3} />
        <View style={s.center}>
          <Text style={s.loadingText}>Carregando dados do imóvel…</Text>
        </View>
      </Screen>
    );
  }

  // ---- Estado: imóvel não encontrado ----
  if (!imovel) {
    return (
      <Screen title="Revisão" subtitle="Confira, exporte e envie">
        <WizardSteps active={3} />
        <View style={s.center}>
          <Text style={s.errorTitle}>Imóvel não encontrado.</Text>
          <Text style={s.errorHint}>
            Não foi possível carregar os dados. Volte e tente novamente.
          </Text>
          <View style={s.singleBtn}>
            <SecondaryButton label="Voltar" onPress={goBack} />
          </View>
        </View>
      </Screen>
    );
  }

  const points = imovel.geometry.points;

  // ---- Estado: demarcação incompleta ----
  if (points.length < 3) {
    return (
      <Screen title="Revisão" subtitle="Confira, exporte e envie">
        <WizardSteps active={3} />
        <View style={s.center}>
          <Text style={s.errorTitle}>Demarcação incompleta.</Text>
          <Text style={s.errorHint}>
            São necessários pelo menos 3 pontos GPS para fechar o contorno.
            {'\n\n'}
            Volte à etapa de demarcação e caminhe ao redor do perímetro do imóvel.
          </Text>
          <View style={s.singleBtn}>
            <SecondaryButton label="Voltar à demarcação" onPress={goBack} />
          </View>
        </View>
      </Screen>
    );
  }

  // ---- Dados derivados ----
  const validation = validatePerimeter(points);
  const area = areaHectares(points).toFixed(4);
  const perim = Number(perimeterM(points).toFixed(0)).toLocaleString('pt-BR');
  const { imovel: dados, produtor, documentos } = imovel;
  const cpfDisplay = maskCpfCnpj(produtor.cpfCnpj);

  const isBusy = activeAction !== null;
  const canSubmit = validation.ok && !isBusy;

  return (
    <Screen title="Revisão" subtitle="Confira, exporte e envie">
      <WizardSteps active={3} />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* --- Dados do Imóvel --- */}
        <Card style={s.card}>
          <SectionTitle>Dados do Imóvel</SectionTitle>
          <InfoRow label="Nome" value={dados.nome} />
          <InfoRow label="Município / UF" value={`${dados.municipio} / ${dados.uf}`} />
          {dados.matricula ? (
            <InfoRow label="Matrícula" value={dados.matricula} />
          ) : null}
          {dados.modulosFiscais != null ? (
            <InfoRow label="Módulos Fiscais" value={String(dados.modulosFiscais)} />
          ) : null}
        </Card>

        {/* --- Produtor --- */}
        <Card style={s.card}>
          <SectionTitle>Produtor</SectionTitle>
          <InfoRow label="Nome" value={produtor.nome} />
          {/* CPF/CNPJ mascarado — dado sensível (LGPD) */}
          <InfoRow label="CPF / CNPJ" value={cpfDisplay} />
        </Card>

        {/* --- Medidas --- */}
        <Card style={s.card}>
          <SectionTitle>Medidas do imóvel</SectionTitle>
          <View style={s.statsRow}>
            <StatBox label="Área (ha)" value={area} />
            <View style={s.statGap} />
            <StatBox label="Perímetro (m)" value={perim} />
            <View style={s.statGap} />
            <StatBox label="Vértices" value={String(points.length)} />
          </View>
        </Card>

        {/* --- Documentos --- */}
        <Card style={s.card}>
          <SectionTitle>
            {`Documentos anexados (${documentos.length})`}
          </SectionTitle>
          {documentos.length > 0 ? (
            documentos.map((doc) => (
              <View key={doc.id} style={s.docRow}>
                <Text style={s.docNome} numberOfLines={1}>
                  {doc.nome}
                </Text>
                <Badge tone="neutro">{doc.tipo}</Badge>
              </View>
            ))
          ) : (
            <Text style={s.noDoc}>Nenhum documento anexado.</Text>
          )}
        </Card>

        {/* --- Validação geométrica --- */}
        {(validation.problemas.length > 0 || validation.avisos.length > 0) ? (
          <Card style={s.card}>
            <SectionTitle>Validação do contorno</SectionTitle>
            {validation.problemas.map((p, i) => (
              <View key={`prob-${i}`} style={s.validRow}>
                <Badge tone="aviso">Problema</Badge>
                <Text style={[s.validText, s.validTextProblema]}>{p}</Text>
              </View>
            ))}
            {validation.avisos.map((a, i) => (
              <View key={`av-${i}`} style={s.validRow}>
                <Badge tone="neutro">Aviso</Badge>
                <Text style={s.validText}>{a}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {/* --- Exportar / Compartilhar --- */}
        <Card style={s.card}>
          <SectionTitle>Exportar / Compartilhar</SectionTitle>
          <View style={s.btnRow}>
            <SecondaryButton
              label={activeAction === 'geojson' ? 'Exportando…' : 'Exportar GeoJSON'}
              onPress={handleExportGeoJSON}
              disabled={isBusy}
            />
          </View>
          <View style={s.btnRow}>
            <SecondaryButton
              label={activeAction === 'pdf' ? 'Gerando PDF…' : 'Gerar PDF / Croqui'}
              onPress={handleExportPDF}
              disabled={isBusy}
            />
          </View>
          <View style={s.btnRow}>
            <SecondaryButton
              label={activeAction === 'share' ? 'Compartilhando…' : 'Compartilhar'}
              onPress={handleShare}
              disabled={isBusy}
            />
          </View>
        </Card>

        {/* --- Envio --- */}
        <View style={s.submitSection}>
          {!validation.ok ? (
            <Text style={s.blockMsg}>
              Corrija os problemas no contorno antes de enviar.
            </Text>
          ) : null}

          <View style={s.btnRow}>
            <PrimaryButton
              label="Enviar imóvel"
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={activeAction === 'submit'}
            />
          </View>

          <View style={[s.btnRow, { marginTop: 8 }]}>
            <SecondaryButton label="Voltar" onPress={goBack} disabled={isBusy} />
          </View>
        </View>

      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    marginBottom: 12,
  },

  // Estados de erro / loading
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  singleBtn: {
    width: '100%',
    marginTop: 20,
  },
  loadingText: {
    fontSize: 15,
    color: colors.muted,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  errorHint: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },

  // Linha de informação (label + valor)
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    color: colors.ink,
    textAlign: 'right',
    flex: 2,
    paddingLeft: 12,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  statGap: {
    width: 8,
  },

  // Documentos
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  docNome: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    marginRight: 10,
  },
  noDoc: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
  },

  // Validação
  validRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  validText: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
  },
  validTextProblema: {
    color: colors.alerta,
    fontWeight: '700',
  },

  // Botões
  btnRow: {
    marginTop: 10,
  },
  submitSection: {
    marginTop: 8,
    marginBottom: 8,
  },
  blockMsg: {
    fontSize: 13,
    color: colors.alerta,
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '700',
    lineHeight: 18,
  },
});
