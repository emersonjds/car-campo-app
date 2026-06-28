// Tokens canônicos do novo design system + aliases para as telas existentes
// (não remover aliases enquanto a migração de telas estiver em curso).
export const colors = {
  primary:   '#2D5A27', // verde principal — botões, cabeçalho, marca
  secondary: '#8B5E3C', // terra/marrom — acento, ícones secundários
  tertiary:  '#00A8E8', // azul — info, precisão L2, links
  neutral:   '#F9F8F6', // fundo do app

  inkText:   '#1d2b22', // texto principal
  mutedText: '#5d6b62', // texto secundário

  critico:   '#a3302a', // divergência crítica / alerta vermelho
  aviso:     '#8a5a13', // atenção / âmbar

  line:      '#d9e4dc', // bordas e divisores
  branco:    '#ffffff', // cards e superfícies

  // Preservados (conferência do analista)
  acrescido: '#f59e0b', // área acrescida
  suprimido: '#2579c7', // área suprimida / hidrografia / APP

  // ponytail: mantidos como cópias de valor (não referência) para o objeto ser
  // serializável pelo Metro bundler. Remover após a migração completa das telas.
  verde:      '#2D5A27', // → primary
  verdeClaro: '#4a8c42', // variação viva do primary (traços no mapa, avatares)
  verdeBg:    '#eaf3e6', // superfície verde-clara coerente com primary
  terra:      '#8B5E3C', // → secondary
  ink:        '#1d2b22', // → inkText
  muted:      '#5d6b62', // → mutedText
  alerta:     '#a3302a', // → critico
};
