# Validação de Sobreposição do Terreno contra Mapas Oficiais

## Capa

**CAR Campo — Documentação Técnica**

Validação de Sobreposição de Imóveis contra Mapas Oficiais

Público: Produtor Rural e Analista de Órgão Ambiental

Versão 1.0 | junho de 2026

---

## Sumário

1. [O problema](#o-problema)
2. [Como funciona a validação](#como-funciona-a-validação)
3. [As camadas oficiais](#as-camadas-oficiais)
4. [O que dá para afirmar](#o-que-dá-para-afirmar)
5. [O que NÃO dá para afirmar](#o-que-não-dá-para-afirmar)
6. [O que isso destrava para o produtor](#o-que-isso-destrava-para-o-produtor)
7. [O que resolve para o analista](#o-que-resolve-para-o-analista)
8. [Limitações offline e roadmap](#limitações-offline-e-roadmap)
9. [Glossário](#glossário)
10. [Fontes](#fontes)

---

## O problema

Quando você desenha um perímetro de imóvel rural usando o app CAR Campo, o desafio é **saber se aquele desenho cruza com áreas protegidas, com desmatamento ilegal, ou com restrições ambientais**.

Por quê isso importa?

- **Para você (produtor)**: Se o terreno invade uma Terra Indígena ou Unidade de Conservação, a sobreposição anula qualquer direito de uso naquela fração. Se há alerta de desmatamento após 2008, crédito rural pode ser negado.
- **Para o banco**: Quem financia (Pronaf, Pronampe) precisa saber se há embargo IBAMA ou invasão de APP antes de liberar recurso.
- **Para o órgão ambiental**: Precisa triagar imóveis de risco alto (terraplanagem em APP, TI, UC) antes de auditar manualmente.

O app CAR Campo, rodando localmente no seu celular, **já calcula área e perímetro geodésicos com precisão** — sabemos se você desenhou 50 ha ou 150 ha. Agora precisamos conferir se esse desenho bate com a realidade dos mapas oficiais.

Este documento explica:
- Como a validação funciona (interseção de polígonos com camadas públicas)
- Quais são as camadas e o que elas significam
- **O que dá para afirmar com rigor** e o que não dá
- Quais informações destravam crédito e regularização para você
- Como o sistema funciona offline e o que muda quando conecta

---

## Como funciona a validação

### 1. Interseção de Polígonos

Validar sobreposição é comparar **dois polígonos**: o perímetro que você desenhou vs. um perímetro de restrição oficial (Terra Indígena, Unidade de Conservação, área embargada, etc.).

**Exemplo prático:**

```
Seu imóvel: 50 ha em formato retangular
Terra Indígena Yanomami: polígono oficial do FUNAI (EPSG:4674)

Resultado: 2.3 ha de interseção = 4.6% da sua propriedade invade TI
```

A lógica:
1. **Ler o perímetro que você desenhou** (pontos GPS em WGS84 lon/lat)
2. **Buscar camadas oficiais** que cobrem aquela região (quadrante de latitude/longitude)
3. **Calcular a interseção** usando algoritmos de geometria computacional
4. **Gerar relatório** com hectares e percentual de sobreposição por camada

### 2. Comparação de Área Declarada vs. Calculada

Você declara "meu imóvel tem 50 ha" no cadastro. O app calcula a área geodésica do perímetro que você desenhou. **Se a diferença é grande**, pode indicar erro de desenho, GPS impreciso, ou má-fé.

**Exemplo:**

```
Área declarada:  50 ha
Área calculada:  47.8 ha (diferença: 4.4% — OK)
Área calculada:  120 ha (diferença: 140% — ALERTA: revisar desenho)
```

Diferenças pequenas (até ~5%) são normais (GPS celular é ±5–10 metros, e isso gera pequenos erros). Diferenças grandes indicam que o produtor "expandiu" o desenho intencionalmente.

### 3. Cálculo de Hectares e Percentual

A área de um polígono é calculada usando **fórmula geodésica esférica**:

- Entrada: coordenadas WGS84 (longitude/latitude)
- Saída: área em hectares (1 ha = 10.000 m²)

Exemplo de saída:

```json
{
  "imovel_area_ha": 50.0,
  "interseções": [
    {
      "camada": "Embargo IBAMA",
      "area_interseção_ha": 2.5,
      "percentual": "5.0%",
      "severidade": "Médio"
    },
    {
      "camada": "Desmatamento PRODES",
      "area_interseção_ha": 0.8,
      "percentual": "1.6%",
      "data_alerta": "2023-06-15"
    }
  ]
}
```

---

## As camadas oficiais

Estas são as camadas públicas que o CAR Campo valida:

| Camada | Órgão | O que é | Impacto | URL / Fonte |
|--------|-------|--------|--------|------------|
| **Terra Indígena (TI)** | FUNAI | Terras demarcadas ou em processo de demarcação sob proteção da União | Qualquer ha de sobreposição invalida o direito de uso naquela fração. Sem exceções. | WFS FUNAI; INCRA/SIPRA |
| **Unidade de Conservação (UC)** | ICMBio / MMA | Terras protegidas: parques, estações ecológicas, florestas nacionais, reservas | Depende do tipo (UC de uso direto vs. integral). Sobreposição pode permitir ou bloquear atividade. | WFS MMA; ICMBio SIMEC |
| **Embargo IBAMA** | IBAMA | Imóveis rural com proibição de desmatamento por não-compliance (Lei da Mata Atlântica, Código Florestal, multas) | Bloqueia crédito rural. APP não restaurada = embargo. Desmatamento após embargo = crime. | IBAMA Embargos; SisLegis |
| **Desmatamento PRODES/DETER** | INPE | Alertas de remoção de cobertura vegetal, detectados via satélite Landsat 8+ / Sentinel-2 | PRODES = anual (oficial); DETER = alertas em tempo real. Sobreposição com desmatamento pós-2008 reduz aptidão a crédito. | INPE PRODES; Monitor da Mata Atlântica |
| **APP e Hidrografia** | MMA / ANA | Áreas de Preservação Permanente (faixa de 30/50m ao redor de rios, lagos, nascentes conforme lei) | Depende de situação: se floresta nativa = OK; se desmatada pós-2008 = deve restaurar. |OGC WFS hidrografia; Mapa Base Brasil |
| **Reserva Legal (RL)** | SICAR / MMA | Fração do imóvel que deve manter floresta nativa (20% mata atlântica, 80% Amazônia) | Não é uma camada de "interseção" fixa, mas **resultado da análise**: APP + RL devem totalizar % mínimo de cobertura vegetal. | SICAR integrado |

**Nota sobre painéis de visualização**

Você pode ver dados estatísticos em dashboards públicos (ex.: painel.car.gov.br, painéis estaduais Power BI). Esses painéis mostram **gráficos e totalizações** (ex.: "Estado de MT tem 2.3M ha embargados"). Porém, eles **não são APIs geoespaciais consultáveis**. A validação real requer acesso aos WFS (Web Feature Service) do MMA, FUNAI, INPE, etc., que retornam geometrias completas para interseção.

---

## O que dá para afirmar

Com a validação de sobreposição, você pode afirmar com confiança:

### ✓ Sobreposição quantificada
"Este imóvel tem **2.5 ha (5.0%)** de sobreposição com área embargada pelo IBAMA."

### ✓ Comparação de área
"O produtor declarou 50 ha, mas o perímetro desenhado mede 47.8 ha (4.4% de diferença)."

### ✓ Severidade / Alertas por camada
"Há sobreposição com desmatamento PRODES em junho de 2023 (1.2 ha)."

### ✓ Aptidão a crédito (indicativa)
"Imóvel **não embargado**, sem desmatamento pós-2008, APP completa → **apto para crédito Pronaf**."

### ✓ Laudo técnico
"Relatório de conformidade ambiental: RL em déficit de 3.2 ha; APP com 40% de cobertura (deve ser 100%)."

### ✓ Priorização de análise
"Imóvel com sobreposição Terra Indígena → **prioridade alta** para vistoria de campo."

---

## O que NÃO dá para afirmar

Seja rigoroso com os limites:

### ✗ Titularidade da terra
A validação **não confirma quem é o dono**. Somente o INCRA (via SIPRA/Padrão de Terceiros) e Justiça (ações reais de imóvel) determinam titularidade. O app não substitui busca de matrícula no Cartório.

### ✗ Legalidade definitiva de desmatamento
Se o app detecta sobreposição com desmatamento PRODES pós-2008, **não afirma automaticamente que é ilegal**. Pode haver exceções:
- Autorização de supressão antes do corte (licença ambiental)
- Área consolidada (Lei 12.651/12, art. 61): desmatamento anterior a 22 de julho de 2008 é legal
- Uso consolidado registrado no SICAR (até limite legal)

Quem afirma legalidade/ilegalidade é a Justiça + IBAMA + PF (após investigação).

### ✗ Precisão sub-métrica
GPS de celular tem precisão de **±5–10 metros** (caso bom). Um iPhone 15 ou Samsung S24 em condições ideais não ultrapassa 3–5 m. Portanto, **slivers menores que 10–20 m² podem ser ruído GPS**, não sobreposição real. A validação funciona bem para áreas > 100 m² (0.01 ha).

### ✗ Datum / Projeção
O app trabalha com WGS84 (EPSG:4326, lon/lat). Camadas oficiais também são convertidas para WGS84 antes de interseção. Porém, em fronteiras de estado e países, pequenos desalinhamentos entre bases podem gerar artefatos. A tolerância aceita é ±10 m.

### ✗ Legalidade de uso anterior
Se o imóvel tem documento de posse de 1995, e o desmatamento PRODES detecta 2010, o fato de ter "posse anterior" não o torna automaticamente legal — quem valida são os órgãos competentes (IBAMA, Justiça). O app apenas **aponta o fato**.

---

## O que isso destrava para o produtor

Ter um imóvel validado no CAR Campo (com relatório de conformidade) abre portas:

### 🔓 Regularização Ambiental (CAR ativo)
- Registro do Cadastro Ambiental Rural (CAR) no SICAR
- Plano de Adequação Ambiental (PAA): roteiro para restaurar APP/RL
- Assinatura do Termo de Compromisso com IBAMA (se houver débito)

### 🔓 Crédito Rural
**Exigência**: Imóvel com CAR ativo e **sem embargo IBAMA** (conforme resoluções do Banco Central/MAPA).

- **Pronaf** (até ~150 ha, agricultura familiar): requer CAR
- **Pronampe** (micro e pequenas empresas): requer CAR + ausência de embargo
- **Crédito Funceme** / outros bancos: cada um tem sua política, mas tendem a exigir CAR + relatório de conformidade

A validação de sobreposição **não garante aprovação de crédito** — mas remove um obstáculo crítico.

### 🔓 Transparência com terceiros
- Relatório PDF/GeoJSON para mostrar ao consultor, banco, ONG
- Evidência de diligência ambiental (due diligence)
- Proteção contra acusações futuras: "Eu validei meu imóvel, estava OK quando registrei"

---

## O que resolve para o analista

Para a equipe técnica de IBAMA, ICMBio, órgãos estaduais e consultores:

### 1️⃣ Triagem automática
Imóveis com sobreposição > 1% em TI/UC/embargo ganham **bandeira vermelha** — prioridade para vistoria.

### 2️⃣ Priorização
Ao invés de auditar 1.000 imóveis manualmente, ordena por risco:
- Alto: sobreposição TI, desmatamento PRODES pós-2008
- Médio: embargo IBAMA < 5%, APP parcial
- Baixo: conformidade integral, pequeno desvio área declarada

### 3️⃣ Aceleração de pareceres
Relatório gerado pelo app fornece:
- Coordenadas precisas (para vistoria de campo com GPS)
- Croqui do perímetro (referência para topógrafo)
- Intersecções quantificadas (baliza o tamanho da intervenção)

### 4️⃣ Redução de polígonos mal desenhados
Imóveis com perímetro que se cruza (auto-interseção) ou com área muito pequena/grande vs. declarada são rejeitados **antes de chegar ao analista**.

### 5️⃣ Suporte a decisão em campo
Analista leva iPad com app offline, consulta o relatório, valida se o terreno real bate com o desenho.

---

## Limitações offline e roadmap

### Hoje (versão 1.0 — offline-first)

✓ **Cálculo de área/perímetro** geodésico (seu imóvel)
✓ **Validação de geometria** (auto-interseção, anel fechado, GPS ruim)
✓ **Modo demo** com rotas pré-carregadas (teste sem GPS real)

⚠️ **Interseção contra camadas oficiais**: requer backend (CAR Geo API) — app local não tem as camadas FUNAI/IBAMA carregadas

✗ **Offline não valida contra camadas públicas** — você desenha, valida local (geom OK?), depois **envia à API quando há rede**. A API faz a interseção no servidor.

### Roadmap (futuro)

📌 **Cache de camadas** offline
- Baixar camadas (TI, UC, embargo) para uma região quando conecta
- Validar offline usando cache local
- Sincronizar quando houver rede

📌 **WFS offline**
- Integrar biblioteca como mapbox/basemap para servir WFS cached
- Suportar re-validação em aeroporto, mata adentro, sem dados

📌 **Exportação de parecer técnico**
- PDF com assinatura digital (eIDAS)
- Laudo de conformidade + lista de alertas

📌 **Integração com SICAR**
- Envio automático para registro CAR via API SICAR (quando autorização)

---

## Glossário

**APP** (Área de Preservação Permanente)
Faixa de terra ao redor de rios, lagos, lagoas, nascentes, encostas — deve manter cobertura vegetal conforme Lei 12.651/12.

**CAR** (Cadastro Ambiental Rural)
Registro de auto-declaração do imóvel rural no SICAR, informando perímetro, APP, Reserva Legal, usos.

**Código Florestal** (Lei 12.651/2012)
Lei federal que disciplina proteção da vegetação nativa e estabelece APP e Reserva Legal.

**EPSG:4674** (SIRGAS 2000)
Sistema geodésico oficial do Brasil. Muito similar a WGS84 (diferença < 1m); o app converte internamente.

**GeoJSON** (RFC 7946)
Formato padrão aberto para geometrias em longitude/latitude (WGS84).

**Geodésica / Geodésico**
Cálculo que leva em conta a curvatura da Terra, não apenas geometria plana. Necessário para áreas rurais > 100 m² com precisão.

**IBAMA** (Instituto Brasileiro do Meio Ambiente e Recursos Naturais Renováveis)
Órgão federal que supervisiona enforcement ambiental, emite embargos, autoriza supressões.

**INPE** (Instituto Nacional de Pesquisas Espaciais)
Órgão que monitora desmatamento via satélites (PRODES anual, DETER em tempo real).

**Interseção de polígonos**
Operação geométrica que encontra a sobreposição entre dois polígonos e calcula sua área.

**RL** (Reserva Legal)
Fração do imóvel privado que deve manter vegetação nativa: 80% Amazônia, 20% Mata Atlântica, etc.

**SICAR** (Sistema de Cadastro Ambiental Rural)
Plataforma online do MMA que centraliza registros de CAR de todos os estados.

**WFS** (Web Feature Service)
Padrão OGC que permite consultar geometrias vetoriais online (ex.: "quais Terras Indígenas cruzam com ponto X,Y?").

**WGS84** (EPSG:4326)
Sistema geodésico mundial, padrão para GPS e GeoJSON. Latitude/longitude em graus decimais.

---

## Fontes

**Legislação e Regulação**
- Lei Federal nº 12.651, de 25 de maio de 2012 (Código Florestal Brasileiro)
- Resolução CONAMA nº 369/2006 (Supressão em APP)
- Resolução Banco Central nº 5.097/2022 (Política de Crédito Rural — exigência de CAR)

**Bases de Dados Públicas**
- FUNAI — Terras Indígenas: https://www.funai.gov.br/
- INCRA — Terras Federais / SIPRA: https://www.gov.br/incra/
- ICMBio / MMA — Unidades de Conservação: https://www.icmbio.gov.br/
- IBAMA — Embargos e Licenças: https://www.ibama.gov.br/
- INPE — PRODES / DETER: https://www.inpe.gov.br/
- MMA — SICAR / Hidrografia: https://www.gov.br/mma/

**Documentação Técnica**
- RFC 7946 (GeoJSON): https://tools.ietf.org/html/rfc7946
- OGC Web Feature Service: https://www.ogc.org/standards/wfs
- EPSG:4674 (SIRGAS 2000): https://epsg.io/4674

**Referências do Projeto**
- CAR Campo GitHub: https://github.com/haCARthon/car-campo-app
- CAR Geo API: https://github.com/haCARthon/car-geo-api
- Código de cálculo geodésico: `src/lib/geo.ts`

---

**Versão 1.0 | junho de 2026**
Documentação gerada para haCARthon · Desafio 2 · Solução 4
