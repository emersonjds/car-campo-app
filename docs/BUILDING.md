# Guia de Build — CAR Campo

Como fazer build do app para diferentes plataformas.

## Por que é preciso um Development Build?

Este app **não roda no Expo Go** porque:

1. **`react-native-maps`** — renderização de mapas não é suportada.
2. **`expo-location`** — GPS tem limitações no Go.
3. **`expo-image-picker`, `expo-document-picker`** — câmera e arquivos.

Portanto, é necessário criar um **development build** que inclui esses módulos compilados nativamente.

---

## Build Local (Recomendado para Dev)

### Pré-requisitos

#### macOS + iOS

- **Xcode** ≥ 15
- **Ruby** ≥ 2.7 (geralmente já vem no macOS)
- **CocoaPods**: `sudo gem install cocoapods`

#### macOS/Linux + Android

- **Android Studio** ≥ 2023.1
- **Java Development Kit (JDK)** ≥ 11
- **NDK** (Android Native Development Kit) — instalado via Android Studio

### 1. Preparar o projeto

```bash
cd car-campo-app
bun install
# ou: yarn install
```

### 2. Build iOS

#### Opção A: Usar `eas build --local` (Recomendado)

```bash
eas build --platform ios --local --profile development
```

Requisitos:
- Conta Expo (crie em https://expo.dev)
- Apple Developer account (se quer testar em device físico)

O build vai:
1. Compilar o código nativo
2. Criar um `.app` ou `.ipa`
3. Instalar automaticamente no simulador (ou pedir para você instalar no device)

#### Opção B: Usar `expo prebuild + run`

Mais direto, sem Expo Cloud:

```bash
# Limpar builds anteriores
rm -rf ios/

# Pré-buildar (gera pasta ios/)
npx expo prebuild --clean --platform ios

# Compilar e rodar
npx expo run:ios

# Ou abrir no Xcode para mais controle
open ios/CarCampoApp.xcworkspace
# Depois: Product → Run (ou Cmd+R)
```

### 3. Build Android

#### Opção A: Usar `eas build --local`

```bash
eas build --platform android --local --profile development
```

O processo:
1. Compila o código nativo (Gradle)
2. Gera um `.apk` ou `.aab`
3. Instala no emulador ou conecta ao device

#### Opção B: Usar `expo prebuild + run`

```bash
# Preparar
rm -rf android/

npx expo prebuild --clean --platform android

# Rodar (instala no emulador automático ou device conectado)
npx expo run:android
```

---

## Build para Distribuição (App Store / Play Store)

### iOS App Store

```bash
eas build --platform ios --auto-submit
```

Antes, configure em `app.json`:
```json
"ios": {
  "bundleIdentifier": "br.gov.car.campo"
}
```

Requisitos:
- Apple Developer Program ($99/ano)
- Provisioning profiles configurados no Expo
- Certificados assinados

### Android Play Store

```bash
eas build --platform android --auto-submit
```

Configure em `app.json`:
```json
"android": {
  "package": "br.gov.car.campo"
}
```

Requisitos:
- Google Play Developer account ($25, uma vez)
- Keystore assinado (Expo gerencia automaticamente)

---

## Variáveis de Build

### Configurar URL da API antes de buildar

```bash
# Defina antes do build
export EXPO_PUBLIC_API_BASE_URL=https://api.car.gov.br

# Ou edite app.json
# "extra": { "apiBaseUrl": "https://api.car.gov.br" }

eas build --local
```

### Profiles de Build

No `eas.json`:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "env": {
        "EXPO_PUBLIC_API_BASE_URL": "http://localhost:3000"
      }
    },
    "staging": {
      "env": {
        "EXPO_PUBLIC_API_BASE_URL": "https://staging-api.car.gov.br"
      }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_API_BASE_URL": "https://api.car.gov.br"
      }
    }
  }
}
```

Use assim:

```bash
eas build --platform ios --profile production
```

---

## Troubleshooting

### "Xcode not found" (macOS)

```bash
sudo xcode-select --install
```

### "Android SDK not found"

No Android Studio:
1. Abra **Preferences / Settings**
2. Vá para **Languages & Frameworks → Android SDK**
3. Instale o SDK (API level 33+)
4. Anote o caminho (ex.: `/Users/seu-usuario/Library/Android/sdk`)
5. Defina `ANDROID_SDK_ROOT`:

```bash
export ANDROID_SDK_ROOT=$HOME/Library/Android/sdk
```

### "eas is not installed"

```bash
npm install -g eas-cli
```

### Build fica preso ou lento

- Limpe o cache: `bun install --force` ou `yarn install --force`
- Delete build prévios: `rm -rf ios/ android/ node_modules/`
- Use a máquina mais potente (compilar código nativo é pesado)

### Erro ao instalar no device físico

**iOS**: verifique provisioning profiles em Xcode:
```
Xcode → Preferences → Accounts → Download Manual Profiles
```

**Android**: ative "Developer mode" no device:
1. Vá para **Settings → About phone**
2. Toque 7 vezes em "Build number"
3. Ative "Developer mode"
4. Conecte via USB

Depois:

```bash
npx expo run:android
```

---

## Verificar Build

Depois de buildar, confirme:

1. **Abrir o app** — tela de perfil deve aparecer.
2. **Testar GPS** — toque em "Começar a caminhar", confirme que pede permissão.
3. **Testar câmera** — vá a "Documentos", toque em "Tirar foto".
4. **Testar mapa** — confirma que carrega (sem erro de `MapView`).
5. **Testar offline** — ative airplane mode, crie um imóvel, desative airplane mode, confirma que tenta enviar.

---

## CI/CD (Opcional)

Se você quiser builds automáticos (ex., a cada push), configure no **GitHub Actions** ou **EAS Webhooks**:

```yaml
# .github/workflows/build.yml
name: EAS Build

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: expo/expo-github-action@v8
      - run: eas build --platform android --non-interactive --wait
```

---

## Próximos Passos

- [ ] Configurar signing certificates (Apple + Google)
- [ ] Testar em device físico
- [ ] Configurar CI/CD
- [ ] Fazer upload para TestFlight (iOS) / Internal testing (Android)
- [ ] Publicar na App Store / Play Store

---

Dúvidas? Veja [DEVELOPMENT.md](./DEVELOPMENT.md) para mais detalhes.
