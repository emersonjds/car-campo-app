# Documentação — CAR Campo

Guia de navegação e índice de todos os documentos.

## Para Produtores Rurais

- **[guia-do-produtor.md](./guia-do-produtor.md)** — Como usar o app do zero. Passo a passo simples, linguagem acessível, sem jargão técnico.

## Para Desenvolvedores

### Começo Rápido
- **[QUICK_START.md](./QUICK_START.md)** — Em 5 minutos, rode o app no seu computador. Pré-requisitos mínimos.

### Desenvolvimento
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** — Setup completo, estrutura do projeto, debugging, troubleshooting. Tudo que você precisa para hackear o código.

### Build & Deploy
- **[BUILDING.md](./BUILDING.md)** — Como fazer build para iOS/Android, local ou produção. EAS, Xcode, Android Studio.

### Arquitetura & Fluxo de Dados
- **[FLUXO_DADOS.md](./FLUXO_DADOS.md)** — Diagrama visual de como os dados fluem pelo app (captura → persistência → envio). Entenda cada módulo.

### Referência Técnica
- **[../README.md](../README.md)** — Visão geral do projeto, stack, features, arquitetura em alto nível.
- **[../CLAUDE.md](../CLAUDE.md)** — Contexto para agentes de IA. Regras do projeto, padrões, decisões arquiteturais.

---

## Estrutura de Pastas

```
car-campo-app/
├── docs/                         ← você está aqui
│   ├── INDEX.md                 (este arquivo)
│   ├── guia-do-produtor.md      (para usuários finais)
│   ├── QUICK_START.md           (começo rápido para devs)
│   ├── DEVELOPMENT.md           (tudo sobre dev)
│   ├── BUILDING.md              (build e deploy)
│   ├── FLUXO_DADOS.md           (arquitetura)
│   └── ...
├── src/
│   ├── app/                     (navegação e roteador)
│   ├── screens/                 (telas do wizard)
│   ├── hooks/                   (usePerimeterTracker, etc.)
│   ├── lib/                     (lógica: geo, api, store, export)
│   ├── sim/                     (simulação de caminhada)
│   ├── ui/                      (componentes compartilhados)
│   ├── theme/                   (cores, estilos)
│   └── types.ts                 (modelos TypeScript)
├── App.tsx                      (ponto de entrada)
├── app.json                     (config Expo)
├── package.json                 (dependências)
├── README.md                    (overview do projeto)
├── CLAUDE.md                    (contexto para IA)
└── ...
```

---

## Mapa Rápido por Tópico

### "Quero entender o projeto"
1. Leia [README.md](../README.md)
2. Veja a arquitetura em [FLUXO_DADOS.md](./FLUXO_DADOS.md)
3. Para mais detalhes, veja [DEVELOPMENT.md](./DEVELOPMENT.md)

### "Quero começar a codar"
1. [QUICK_START.md](./QUICK_START.md) — 5 minutos para rodar
2. [DEVELOPMENT.md](./DEVELOPMENT.md) — setup completo, debugging
3. [FLUXO_DADOS.md](./FLUXO_DADOS.md) — entenda o fluxo

### "Quero fazer build para produção"
→ [BUILDING.md](./BUILDING.md)

### "Quero usar o app como produtor"
→ [guia-do-produtor.md](./guia-do-produtor.md)

### "Quero entender como os dados fluem"
→ [FLUXO_DADOS.md](./FLUXO_DADOS.md)

### "Não consegui fazer algo funcionar"
→ Seção "Troubleshooting" em [DEVELOPMENT.md](./DEVELOPMENT.md) ou [BUILDING.md](./BUILDING.md)

---

## Features Principais

- ✅ Seleção de perfil (Produtor / Analista)
- ✅ Home "Meus imóveis" (lista offline, criar/abrir/deletar)
- ✅ Wizard de 4 passos por imóvel:
  1. Cadastro (dados do imóvel e produtor)
  2. Demarcação (GPS real ou modo Simular caminhada)
  3. Documentos (matrícula, CCIR, RG, foto georreferenciada)
  4. Revisão (validação, exportar GeoJSON/PDF, enviar)
- ✅ Offline-first (AsyncStorage, fila de sincronização)
- ✅ Cálculos geodésicos (área, perímetro)
- ✅ Validação geométrica (anel fechado, auto-interseção)
- ✅ Exportação (GeoJSON RFC 7946, PDF, compartilhar)
- ✅ LGPD (dados sensíveis protegidos)

---

## Stack

Expo 56 · React 19 · React Native 0.85 · TypeScript · Bun

Libs: `expo-location`, `react-native-maps`, `@react-native-async-storage/async-storage`, `expo-image-picker`, `expo-document-picker`, `expo-print`, `expo-sharing`, `react-native-reanimated`.

---

## Contato / Suporte

- Veja [../CLAUDE.md](../CLAUDE.md) para contexto técnico completo
- Veja `.claude/agents/` para especialistas por área (front, geo, segurança, etc.)

---

**Última atualização**: 2026-06-26

Mantenha esta documentação sincronizada com o código. Se mudar a arquitetura, atualize aqui também.
