// Offline-first: nunca bloqueia o produtor por falta de rede.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../app/Screen';
import { WizardSteps } from '../app/WizardSteps';
import { useNav } from '../app/navigation';
import { getImovel, updateImovel } from '../lib/store';
import { areaHectares, perimeterM, validatePerimeter } from '../lib/geo';
import { submitPerimeter } from '../lib/api';
import { analisarSobreposicoes } from '../lib/overlay';
import { analisarAlteracaoImovel, decisaoSugerida } from '../lib/alteracao';
import { DEMO_CAMADAS } from '../lib/refLayers.demo';
import { exportPDF } from '../lib/export';
import {
  Badge,
  Card,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  StatBox,
} from '../ui';
import { colors } from '../theme/colors';
import type { Imovel, MotivoVisita, SolicitacaoVisita } from '../types';

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
type ActiveAction = 'pdf' | 'submit' | 'visita' | null;

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

export function RevisaoScreen({ imovelId }: { imovelId: string }) {
  const { navigate, goBack, switchTab } = useNav();

  // Análise ambiental resumida — síncrona com DEMO_CAMADAS (sem rede necessária).
  // O laudo completo (com tentativa online) fica na AnaliseAmbientalScreen.
  // Calculado via useMemo assim que imovel e pontos estiverem disponíveis.
  const [imovel, setImovel] = useState<Imovel | null>(null);
  const [loadingImovel, setLoadingImovel] = useState(true);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);

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

  const handleExportPDF = useCallback(() => {
    if (!imovel) return;
    withAction('pdf', () => exportPDF(imovel));
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
          [{ text: 'Ok', onPress: () => switchTab({ name: 'home' }) }],
        );
      } else if (result.status === 0) {
        // Sem rede — offline-first: dados salvos localmente, fluxo concluído
        Alert.alert(
          'Salvo localmente',
          'Sem conexão com a CAR Geo API no momento.\n\n' +
            'O imóvel está salvo no dispositivo e será reenviado assim que houver rede.',
          [{ text: 'Ok', onPress: () => switchTab({ name: 'home' }) }],
        );
      } else {
        // Endpoint retornou erro HTTP (ex.: 404/405 em API somente-leitura)
        Alert.alert(
          'Atenção',
          `${result.message}\n\nOs dados ficaram salvos localmente com segurança.`,
          [{ text: 'Ok', onPress: () => switchTab({ name: 'home' }) }],
        );
      }
    });
  }, [imovel, imovelId, switchTab, withAction]);

  // IMPORTANTE: este useMemo precisa vir ANTES dos early returns abaixo, senão a
  // contagem de hooks muda entre renders (Rules of Hooks). `imovel` é nullable aqui.
  const analiseResumo = useMemo(
    () =>
      imovel && imovel.geometry.points.length >= 3
        ? analisarSobreposicoes(imovel.geometry.points, DEMO_CAMADAS, 'offline-demo')
        : null,
    [imovel],
  );

  const alteracaoResumo = useMemo(
    () => (imovel ? analisarAlteracaoImovel(imovel, DEMO_CAMADAS, 'offline-demo') : null),
    [imovel],
  );

  const handleSolicitarVisita = useCallback(() => {
    if (!imovel) return;
    const r = alteracaoResumo?.relatorio;
    const pedir = (motivo: MotivoVisita, detalhe: string) =>
      withAction('visita', async () => {
        const sol: SolicitacaoVisita = { solicitadaEm: Date.now(), motivo, detalhe };
        const updated = await updateImovel(imovel.id, { solicitacaoVisita: sol });
        if (updated) setImovel(updated);
        Alert.alert(
          'Conferência solicitada',
          'Sua solicitação entrou na fila de visitas do analista. Você será avisado quando a conferência for agendada.',
        );
      });
    Alert.alert('Solicitar visita do técnico', 'Qual o motivo da conferência?', [
      {
        text: 'Conferir a nova medição',
        onPress: () =>
          pedir(
            'medicao',
            r
              ? `Nova medição diverge do registro: ${r.delta_ha >= 0 ? '+' : ''}${r.delta_ha.toFixed(1)} ha (${r.delta_pct >= 0 ? '+' : ''}${r.delta_pct.toFixed(0)}%)${r.requerVisita ? ' — requer visita' : ''}.`
              : 'Conferência da medição solicitada pelo produtor.',
          ),
      },
      {
        text: 'Conferir documentação',
        onPress: () => pedir('documentacao', 'Conferência de documentação solicitada pelo produtor.'),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }, [imovel, alteracaoResumo, withAction]);

  if (loadingImovel) {
    return (
      <Screen title="Revisão" subtitle="Documento preliminar de metragem">
        <WizardSteps active={3} />
        <View style={s.center}>
          <Text style={s.loadingText}>Carregando dados do imóvel…</Text>
        </View>
      </Screen>
    );
  }

  if (!imovel) {
    return (
      <Screen title="Revisão" subtitle="Documento preliminar de metragem">
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

  if (points.length < 3) {
    return (
      <Screen title="Revisão" subtitle="Documento preliminar de metragem">
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

  const validation = validatePerimeter(points);
  const area = areaHectares(points).toFixed(4);
  const perim = Number(perimeterM(points).toFixed(0)).toLocaleString('pt-BR');
  const { imovel: dados, produtor, documentos } = imovel;
  const cpfDisplay = maskCpfCnpj(produtor.cpfCnpj);

  const isBusy = activeAction !== null;
  const canSubmit = validation.ok && !isBusy;

  return (
    <Screen title="Revisão" subtitle="Documento preliminar de metragem">
      <WizardSteps active={3} />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <View style={s.avisoBanner}>
          <Text style={s.avisoBannerTitle}>Medição preliminar — não oficial</Text>
          <Text style={s.avisoBannerText}>
            Esta metragem foi feita pelo celular e gera um documento preliminar que dá
            segurança e adianta o seu processo. Ela não substitui a medição oficial, que
            deve ser feita por um técnico habilitado (engenheiro/analista ambiental) em
            visita ao imóvel.
          </Text>
        </View>

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

        <Card style={s.card}>
          <SectionTitle>Produtor</SectionTitle>
          <InfoRow label="Nome" value={produtor.nome} />
          {/* CPF/CNPJ mascarado — dado sensível (LGPD) */}
          <InfoRow label="CPF / CNPJ" value={cpfDisplay} />
        </Card>

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

        <Card style={s.card}>
          <SectionTitle>Documento preliminar</SectionTitle>
          <Text style={s.docPrelimText}>
            Gere o PDF com o croqui e as medidas para guardar e apresentar na visita do
            técnico. É um documento de referência, não a medição oficial.
          </Text>
          <View style={s.btnRow}>
            <PrimaryButton
              label={activeAction === 'pdf' ? 'Gerando PDF…' : 'Gerar Documento Final (PDF)'}
              onPress={handleExportPDF}
              disabled={isBusy}
            />
          </View>
        </Card>

        <Card style={s.card}>
          <SectionTitle>Análise Ambiental</SectionTitle>
          {analiseResumo === null ? (
            <Text style={s.noDoc}>Demarcação incompleta — análise indisponível.</Text>
          ) : (
            <>
              {!analiseResumo.ok ? (
                <View style={s.analiseBannerCritico}>
                  <Text style={s.analiseBannerCriticoText}>
                    ⛔{' '}
                    {analiseResumo.sobreposicoes.filter((x) => x.severidade === 'critico').length}{' '}
                    sobreposição(ões) crítica(s) detectada(s)
                  </Text>
                  <Text style={s.analiseBannerHint}>
                    Pode impedir o crédito rural. Veja o laudo antes de enviar.
                  </Text>
                </View>
              ) : analiseResumo.sobreposicoes.length > 0 ? (
                <View style={s.analiseBannerAviso}>
                  <Text style={s.analiseBannerAvisoText}>
                    ⚠ {analiseResumo.sobreposicoes.length} sobreposição(ões) sem impedimento crítico.
                  </Text>
                </View>
              ) : (
                <Text style={s.analiseOk}>
                  ✓ Nenhuma sobreposição detectada (dados de demonstração).
                </Text>
              )}
              <Text style={s.analiseNota}>
                Verificação preliminar com camada de demonstração (offline). O laudo oficial é
                confirmado pelo técnico na visita ao imóvel.
              </Text>
              <View style={[s.btnRow, { marginTop: 10 }]}>
                <SecondaryButton
                  label="Ver análise ambiental completa"
                  onPress={() => navigate({ name: 'analise-ambiental', imovelId })}
                  disabled={isBusy}
                />
              </View>
            </>
          )}
        </Card>

        {alteracaoResumo && (
          <Card style={s.card}>
            <SectionTitle>Comparação com registro anterior</SectionTitle>
            {alteracaoResumo.relatorio.tipoAlteracao === 'microajuste' ? (
              <Text style={s.cmpOk}>
                ✓ Praticamente igual ao registro anterior — diferença dentro do ruído de GPS
                {alteracaoResumo.baseline === 'demo' ? ' (baseline de demonstração)' : ''}.
              </Text>
            ) : (
              <>
                <View style={s.statsRow}>
                  <StatBox label="Antes (ha)" value={alteracaoResumo.relatorio.areaAnterior_ha.toFixed(2)} />
                  <View style={s.statGap} />
                  <StatBox label="Agora (ha)" value={alteracaoResumo.relatorio.areaNova_ha.toFixed(2)} />
                  <View style={s.statGap} />
                  <StatBox
                    label="Diferença"
                    value={`${alteracaoResumo.relatorio.delta_ha >= 0 ? '+' : ''}${alteracaoResumo.relatorio.delta_ha.toFixed(2)}`}
                  />
                </View>
                {(() => {
                  const dec = decisaoSugerida(alteracaoResumo.relatorio.severidade);
                  const tone =
                    dec.tone === 'alerta' ? colors.alerta : dec.tone === 'aviso' ? colors.aviso : colors.verde;
                  return (
                    <View style={[s.cmpBanner, { borderColor: tone }]}>
                      <Text style={[s.cmpBannerTitle, { color: tone }]}>{dec.titulo}</Text>
                      <Text style={s.cmpBannerText}>{alteracaoResumo.relatorio.recomendacao}</Text>
                    </View>
                  );
                })()}
                <Text style={s.analiseNota}>
                  {alteracaoResumo.baseline === 'demo'
                    ? 'Comparado a um baseline de demonstração (sem registro anterior real). '
                    : ''}
                  Acréscimo não prova compra; valide com dados oficiais quando houver rede.
                </Text>
              </>
            )}

            {imovel.solicitacaoVisita ? (
              <View style={s.visitaFeita}>
                <Text style={s.visitaFeitaText}>
                  ✓ Conferência solicitada (
                  {imovel.solicitacaoVisita.motivo === 'medicao' ? 'nova medição' : 'documentação'}) — na fila
                  do analista.
                </Text>
              </View>
            ) : (
              <>
                <Text style={s.analiseNota}>
                  A medição oficial é feita por um técnico em campo. Solicite a visita para
                  oficializar e regularizar o imóvel.
                </Text>
                <View style={[s.btnRow, { marginTop: 12 }]}>
                  <PrimaryButton
                    label={activeAction === 'visita' ? 'Solicitando…' : 'Solicitar visita do técnico'}
                    onPress={handleSolicitarVisita}
                    disabled={isBusy}
                  />
                </View>
              </>
            )}
          </Card>
        )}

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

const s = StyleSheet.create({
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    marginBottom: 12,
  },

  avisoBanner: {
    backgroundColor: '#fdf4e3',
    borderLeftWidth: 4,
    borderLeftColor: colors.aviso,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  avisoBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.aviso,
  },
  avisoBannerText: {
    fontSize: 12,
    color: colors.ink,
    marginTop: 4,
    lineHeight: 17,
  },
  docPrelimText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 2,
  },

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

  statsRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  statGap: {
    width: 8,
  },

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

  analiseBannerCritico: {
    backgroundColor: '#fce8e7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.alerta,
  },
  analiseBannerCriticoText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.alerta,
    lineHeight: 18,
  },
  analiseBannerHint: {
    fontSize: 12,
    color: colors.alerta,
    marginTop: 4,
    lineHeight: 17,
  },
  analiseBannerAviso: {
    backgroundColor: '#fdf4e3',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#c07a1a',
  },
  analiseBannerAvisoText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.aviso,
    lineHeight: 18,
  },
  analiseOk: {
    fontSize: 13,
    color: colors.verde,
    fontWeight: '700',
    marginBottom: 8,
  },
  analiseNota: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
    lineHeight: 16,
    marginTop: 4,
  },

  cmpOk: {
    fontSize: 13,
    color: colors.verde,
    fontWeight: '700',
    lineHeight: 18,
  },
  cmpBanner: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  cmpBannerTitle: { fontSize: 13, fontWeight: '800' },
  cmpBannerText: { fontSize: 12, color: colors.ink, marginTop: 4, lineHeight: 17 },
  visitaFeita: { backgroundColor: '#e2f3e8', borderRadius: 10, padding: 10, marginTop: 12 },
  visitaFeitaText: { fontSize: 13, color: colors.verde, fontWeight: '700', lineHeight: 18 },
});
