# CAR Campo — Simulação de caminhada + Demarcação ponta a ponta

**Data:** 2026-06-26
**Desafio:** haCARthon · Desafio 2 · Solução 4 — App de desenho georreferenciado pelo celular

## Problema

Hoje o app é uma única tela: mapa + captura de perímetro por GPS (`usePerimeterTracker`),
área/perímetro geodésicos (`geo.ts`) e envio de GeoJSON (`api.ts`). Não há persistência,
documentos, dados do imóvel, lista de imóveis nem perfis. Para ser "totalmente funcional
para a pessoa do campo ou analista", o app precisa virar um pequeno app multi-tela, offline-first.

Além disso, demonstrar o app exige caminhar com GPS real — inviável no simulador/palco.
É preciso um **modo demo embutido** que simula uma caminhada (avatar anda, vértices caem).

## Escopo (decidido com o usuário)

- **Simulação:** modo demo embutido (botão "Simular caminhada").
- **Features:** Cadastro do imóvel, Documentos/anexos, Meus imóveis (lista + offline), Exportar/compartilhar.
- **Usuário:** ambos os perfis (Produtor rural + Analista de campo), com seletor de perfil.
- **Dependências:** todas as libs nativas permitidas (exigem rebuild do dev-build).
- **Orquestração:** construir tudo nesta sessão (fundação + agentes em paralelo).

## Arquitetura

Navegação leve baseada em estado + React Context (sem react-navigation nativo), para
manter o app offline-first e o dev-build leve.

### Fluxo de telas

```
Perfil (1ª vez) → Produtor | Analista        (salvo no device)
Home "Meus imóveis" → lista offline (rascunho/enviado) + "＋ Novo imóvel"
Imóvel (wizard 4 passos):
  1. Cadastro      → produtor (CPF/CNPJ), nome, município/UF, matrícula, módulos fiscais
  2. Demarcação    → mapa + caminhada real OU ▶︎ "Simular caminhada"
  3. Documentos    → anexar foto/PDF + foto georreferenciada da divisa
  4. Revisão       → área/perímetro, validação geométrica, Exportar GeoJSON/PDF, Compartilhar, Enviar
```

Analista: fluxo completo + validação geométrica + gestão de pendências.
Produtor: fluxo guiado simplificado. Mesmo código; recursos extras atrás do perfil.

## Módulos

| Módulo | Arquivo(s) | Função |
|---|---|---|
| Sim-walk engine | `src/sim/useSimulatedWalk.ts`, `src/sim/routes.ts` | gera fixes falsos ao longo de rota, marca vértices em tempo real, avatar animado |
| Property store (offline) | `src/lib/store.ts`, `src/types.ts` | CRUD AsyncStorage de `Imovel`, status de sync |
| Documentos | `src/lib/documents.ts` | image-picker/camera/document-picker + file-system, foto geotag |
| Export/share | `src/lib/export.ts` | GeoJSON file, PDF/croqui (expo-print), expo-sharing |
| Geometry validation | estende `src/lib/geo.ts` | auto-interseção, anel fechado, área mínima, simplificação |
| Navigation + screens | `src/app/*`, `src/screens/*`, `src/ui/*` | shell, profile context, Home, 4 telas do wizard, componentes |

## Modelo de dados (`Imovel`)

```ts
interface Documento { id: string; tipo: 'matricula'|'ccir'|'rg'|'foto-divisa'|'outro';
  uri: string; nome: string; lat?: number; lng?: number; createdAt: number }

interface Imovel {
  id: string;
  perfil: 'produtor' | 'analista';
  produtor: { nome: string; cpfCnpj: string };
  imovel: { nome: string; municipio: string; uf: string; matricula?: string; modulosFiscais?: number };
  geometry: { points: LngLat[]; area_ha: number; perimetro_m: number };
  documentos: Documento[];
  status: 'rascunho' | 'enviado';
  createdAt: number; updatedAt: number;
}
```

## Segurança / LGPD (regra do CLAUDE.md)

- CPF/CNPJ é PII → metadados sensíveis via `expo-secure-store`; arquivos no sandbox do app.
- Sem log de coordenadas em produção; HTTPS fora de dev.
- GPS: remover subscription no cleanup; tratar permissão negada; descartar fixes imprecisos.
- Geometria: área/perímetro geodésicos; anel fechado; mínimo 3 vértices.
- Offline-first: capturar e gerar GeoJSON 100% local; enviar quando houver rede.

## Novas dependências

`@react-native-async-storage/async-storage`, `expo-image-picker`, `expo-document-picker`,
`expo-file-system`, `expo-print`, `expo-sharing`, `react-native-reanimated`. Todas SDK 56.

## Plano de construção (agentes)

1. **Fundação (eu):** `types.ts`, `store.ts`, nav shell + profile context, scaffolding das telas, novo `App.tsx`.
2. **Paralelo:**
   - `geo` — validação geométrica + matemática de rota da simulação
   - `front`/`mobile` — sim-walk engine + avatar animado (reanimated)
   - documents module
   - export module
   - `pixel` — UX/microcopy das telas
3. **Quality gate:** `bug` revisa correção/segurança/GPS/offline; `redteam` na superfície PII; `scribe` no README.

## Critérios de sucesso

- Simular caminhada funciona sem GPS real: avatar anda, vértices caem, área/perímetro atualizam.
- Criar imóvel ponta a ponta: cadastro → demarcação → documentos → revisão → salvar offline.
- "Meus imóveis" persiste entre sessões (rascunho/enviado).
- Exportar GeoJSON e PDF; compartilhar.
- Validação geométrica bloqueia polígono inválido (auto-interseção / < 3 vértices).
- `bug` aprova; sem vazamento de subscription; permissão negada tratada.
```