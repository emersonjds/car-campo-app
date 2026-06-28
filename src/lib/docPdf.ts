import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Documento, Imovel } from '../types';
import { CATALOGO_DIGITAL } from './docHub';

function corpoEspecifico(doc: Documento, imovel: Imovel): string {
  const tipo = doc.tipo;
  const cat = CATALOGO_DIGITAL[tipo];
  const car = imovel.imovel.carNumero ?? '—';
  const vertices = imovel.geometry.points.length;
  const area = imovel.geometry.area_ha.toFixed(2);
  const perimetro = imovel.geometry.perimetro_m.toFixed(0);

  switch (tipo) {
    case 'car':
      return `
        <h2>Recibo de Inscrição no CAR</h2>
        <p><strong>Número do CAR:</strong> ${car}</p>
        <p><strong>Situação:</strong> Inscrito</p>
        <p>O imóvel encontra-se inscrito no Sistema Nacional de Cadastro Ambiental Rural (SICAR), nos termos da Lei Federal n.º 12.651/2012 (Código Florestal).</p>`;

    case 'ccir':
      return `
        <h2>Certificado de Cadastro de Imóvel Rural — INCRA</h2>
        <p>Este certificado atesta o cadastro do imóvel rural no Instituto Nacional de Colonização e Reforma Agrária (INCRA), conforme disposto no Estatuto da Terra (Lei n.º 4.504/1964) e legislação complementar.</p>`;

    case 'sigef':
      return `
        <h2>Certidão de Georreferenciamento</h2>
        <p><strong>Área medida:</strong> ${area} ha</p>
        <p><strong>Perímetro:</strong> ${perimetro} m</p>
        <p><strong>Número de vértices:</strong> ${vertices}</p>
        <p>Certidão expedida com base no georreferenciamento realizado pelo SIGEF/INCRA, nos termos do Decreto n.º 4.449/2002.</p>`;

    case 'matricula':
      return `
        <h2>Matrícula do Imóvel</h2>
        <p>Documento expedido pelo Cartório de Registro de Imóveis competente, confirmando a titularidade e as características do imóvel rural.</p>`;

    case 'car-extrato':
      return `
        <h2>Extrato / Demonstrativo do CAR</h2>
        <p><strong>Número do CAR:</strong> ${car}</p>
        <p>Extrato do cadastro com demonstrativo das áreas declaradas, incluindo Área de Preservação Permanente (APP), Reserva Legal (RL) e uso consolidado.</p>`;

    default:
      return `
        <h2>${cat.label}</h2>
        <p>Documento relativo ao imóvel rural, expedido por ${cat.orgao || 'órgão competente'}.</p>`;
  }
}

export function htmlDocumento(doc: Documento, imovel: Imovel): string {
  const cat = CATALOGO_DIGITAL[doc.tipo];
  const modFiscais = imovel.imovel.modulosFiscais != null
    ? `${imovel.imovel.modulosFiscais} módulos fiscais`
    : '—';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; font-size: 13px; color: #1d2b22; margin: 48px; }
    header { border-bottom: 2px solid #2D5A27; padding-bottom: 12px; margin-bottom: 24px; }
    header .orgao { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #5d6b62; }
    header h1 { font-size: 18px; margin: 6px 0 0; color: #2D5A27; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    td { padding: 6px 10px; border: 1px solid #d9e4dc; vertical-align: top; }
    td:first-child { font-weight: 700; width: 40%; background: #eaf3e6; }
    .corpo { margin-top: 24px; line-height: 1.6; }
    footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #d9e4dc; font-size: 10px; color: #5d6b62; font-style: italic; }
  </style>
</head>
<body>
  <header>
    <div class="orgao">${cat.orgao || 'Documento do imóvel rural'}</div>
    <h1>${cat.label}</h1>
  </header>

  <table>
    <tr><td>Nome do imóvel</td><td>${imovel.imovel.nome}</td></tr>
    <tr><td>Município / UF</td><td>${imovel.imovel.municipio} / ${imovel.imovel.uf}</td></tr>
    <tr><td>Nº CAR</td><td>${imovel.imovel.carNumero ?? '—'}</td></tr>
    <tr><td>Matrícula</td><td>${imovel.imovel.matricula ?? '—'}</td></tr>
    <tr><td>Área</td><td>${imovel.geometry.area_ha.toFixed(2)} ha</td></tr>
    <tr><td>Perímetro</td><td>${imovel.geometry.perimetro_m.toFixed(0)} m</td></tr>
    <tr><td>Módulos fiscais</td><td>${modFiscais}</td></tr>
    <tr><td>Proprietário</td><td>${imovel.produtor.nome}</td></tr>
  </table>

  <div class="corpo">${corpoEspecifico(doc, imovel)}</div>

  <footer>
    Documento de demonstração gerado pelo CAR Campo a partir dos dados do imóvel — não substitui a via oficial.
  </footer>
</body>
</html>`;
}

export async function abrirDocumentoDigital(doc: Documento, imovel: Imovel): Promise<void> {
  if (doc.uri) {
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(doc.uri);
    return;
  }

  const cat = CATALOGO_DIGITAL[doc.tipo];
  const { uri } = await Print.printToFileAsync({
    html: htmlDocumento(doc, imovel),
    width: 595,
    height: 842,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: cat.label,
    });
  }
}
