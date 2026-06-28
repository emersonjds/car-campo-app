// Checklist dos próximos documentos/passos para a EMISSÃO OFICIAL do CAR.
//
// Base legal: Lei 12.651/2012 arts. 29-31 (CAR obrigatório, auto-declaratório); Decreto 7.830/2012
// (institui o SICAR); IN MMA nº 2/2014 e atualizações (procedimentos de inscrição); Lei 10.267/2001
// + Decreto 12.689/2025 (georreferenciamento INCRA — prazo para certificação cartorial: out/2029).
// Inscrição no SICAR é auto-declaratória; análise e validação ocorrem APÓS a inscrição.

// Status de cada passo, usado para a tag visual no checklist:
//  feito-app   → já adiantado pela medição do app
//  voce-ja-tem → o produtor já possui (CPF, documento da terra)
//  a-fazer     → ainda precisa providenciar
//  em-analise  → enviado, aguardando o órgão
export type StatusPasso = 'feito-app' | 'voce-ja-tem' | 'a-fazer' | 'em-analise';

export interface PassoCAR {
  id: string;
  label: string;
  orgao: string;
  comoObter: string;
  status: StatusPasso;
  solicitarTecnico?: boolean;
  obrigatorio: boolean;
  nota?: string;
}

export const CHECKLIST_CAR_OFICIAL: PassoCAR[] = [
  {
    id: 'perimetro-gps',
    label: 'Mapa com o contorno exato da propriedade (coordenadas GPS)',
    orgao: 'Produzido pelo próprio produtor ou por técnico habilitado',
    comoObter:
      'O app CAR Campo já gera o perímetro em GPS. Para enviar ao SICAR, o arquivo precisa estar em shapefile (.shp) ou KML — converter o GeoJSON exportado pelo app usando QGIS (gratuito) ou pedir ajuda ao técnico da Emater/sindicato rural.',
    status: 'feito-app',
    obrigatorio: true,
    nota: 'A medição do app é PRELIMINAR (GPS de celular, erro típico de 5 a 10 m). Vale para a inscrição auto-declaratória no SICAR. NÃO substitui levantamento com GPS geodésico para fins de registro em cartório ou georreferenciamento INCRA/SIGEF.',
  },
  {
    id: 'cpf-responsavel',
    label: 'CPF do dono ou possuidor da terra',
    orgao: 'Receita Federal',
    comoObter:
      'Quem já tem CPF: basta tê-lo em mãos. Sem CPF: agendar nos Correios, banco credenciado ou agência da Receita Federal.',
    status: 'voce-ja-tem',
    obrigatorio: true,
  },
  {
    id: 'documento-da-terra',
    label: 'Papel que prova que a terra é sua (ou que você mora nela)',
    orgao: 'Cartório de Registro de Imóveis / INCRA / Instituto de Terras estadual',
    comoObter:
      'Escritura registrada em cartório, matrícula do imóvel, contrato de compra e venda reconhecido em cartório, título de posse emitido pelo INCRA ou pelo instituto de terras do estado.',
    status: 'voce-ja-tem',
    obrigatorio: true,
    nota: 'Sem ao menos um desses documentos, a inscrição no SICAR não pode ser concluída.',
  },
  {
    id: 'ccir-quitado',
    label: 'CCIR quitado (cadastro do imóvel no INCRA)',
    orgao: 'INCRA · incra.gov.br/servicos/ccir',
    comoObter:
      'Emitir e pagar a taxa pelo site do INCRA ou pessoalmente na Superintendência Regional. Para imóveis até 4 módulos fiscais com ITR em dia, o valor é reduzido.',
    status: 'a-fazer',
    obrigatorio: true,
    nota: 'O número do NIRF (Número do Imóvel na Receita Federal) que consta no CCIR é exigido no formulário do SICAR para identificar o imóvel.',
  },
  {
    id: 'croqui-app-reserva-legal',
    label: 'Marcação das áreas de mata, beira de rio e onde você planta',
    orgao: 'Feito pelo produtor dentro do próprio SICAR (car.gov.br)',
    comoObter:
      'Durante a inscrição no SICAR, o sistema mostra imagem de satélite e pede que você pinte no mapa: a beira dos rios/córregos (APP), a área de mata que vira Reserva Legal e as áreas onde já planta ou cria animais (uso consolidado).',
    status: 'a-fazer',
    obrigatorio: true,
    nota: 'Para imóveis simples, o próprio produtor consegue fazer. Em casos com nascentes, topos de morro ou áreas úmidas, vale chamar engenheiro florestal ou agrônomo (CREA/CFR) para não errar.',
  },
  {
    id: 'inscricao-sicar',
    label: 'Fazer o cadastro oficial no sistema do governo (SICAR)',
    orgao: 'SICAR · car.gov.br (ou módulo estadual: SP = SiCAR-SP, MT = CAR-MT, PA = SEMAS, etc.)',
    comoObter:
      'Acessar car.gov.br, escolher o estado, criar conta com CPF e seguir o passo a passo para enviar os dados. Ao final, o sistema emite o Recibo de Inscrição do CAR — guarde esse número, ele já vale para banco e crédito rural enquanto a análise acontece.',
    status: 'a-fazer',
    obrigatorio: true,
  },
  {
    id: 'georreferenciamento-incra-sigef',
    label: 'Medição oficial por técnico com GPS profissional (georreferenciamento)',
    orgao: 'INCRA / SIGEF · sigef.incra.gov.br (via engenheiro agrimensor credenciado no CREA)',
    comoObter:
      'Contratar engenheiro agrimensor ou cartógrafo com ART registrada no CREA. O técnico faz o levantamento com GPS geodésico e certifica no SIGEF. Necessário para registrar ou transferir a propriedade em cartório.',
    status: 'a-fazer',
    solicitarTecnico: true,
    obrigatorio: false,
    nota: 'NÃO é pré-requisito para inscrição no CAR. O prazo para certificação INCRA em transferências cartoriais foi prorrogado até outubro de 2029 (Decreto 12.689/2025). Imóveis até 4 módulos fiscais têm isenção de custos em casos de desmembramento/remembramento.',
  },
  {
    id: 'analise-orgao-estadual',
    label: 'Aguardar a análise do órgão ambiental do seu estado',
    orgao: 'Órgão ambiental estadual (ex.: SEMA, IEF, SEMAD, IAT — varia por estado)',
    comoObter:
      'Automático após a inscrição. Acompanhe pelo número do Recibo de Inscrição em car.gov.br. O órgão pode pedir correções (retificação) ou homologar o CAR.',
    status: 'em-analise',
    obrigatorio: true,
    nota: "O CAR 'em análise' já é aceito como inscrição ativa para acesso a crédito rural (Resolução CMN 4.106/2012 e posteriores). A homologação definitiva ('regularizado') pode levar meses; isso é normal e não impede o produtor de acessar financiamento.",
  },
];
