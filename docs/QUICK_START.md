# Quick Start — CAR Campo

## Em 5 minutos, rode o app localmente.

### Pré-requisitos (uma vez)

- Node.js ≥ 18
- Xcode (macOS) ou Android Studio
- `bun` ou `yarn`

### 1. Clonar e instalar

```bash
git clone <repo>
cd car-campo-app
bun install
```

### 2. Criar development build (primeira vez)

```bash
# iOS
npx expo run:ios

# Android
npx expo run:android
```

Isso:
- Compila o código nativo
- Instala no simulador/emulador
- Abre o app automaticamente

### 3. Iniciar o dev server

Em outro terminal:

```bash
bun start
```

Escolha a plataforma (`i` = iOS, `a` = Android).

### 4. Pronto!

O app está rodando. Você verá:
1. Tela de escolha de perfil
2. Ao escolher, vai para "Meus imóveis"
3. Crie um novo imóvel e siga o wizard

---

## Simular GPS (sem caminhar)

Use o **modo Simular caminhada** dentro do app. Ou:

**Android Emulator:**
```
Extended Controls (⋯) → Location → Routes → Play
```

**iOS Simulator:**
```
Features → Location → City Run
```

---

## Apontar para a API local

Se você tem a `car-geo-api` rodando em `http://localhost:3000`, já está configurado. Se não:

1. Edite `app.json`:
   ```json
   "extra": {
     "apiBaseUrl": "http://seu-ip:3000"
   }
   ```

2. Restart: `bun start` → escolha plataforma

---

## Testar offline

1. Ative **Airplane Mode** no celular/emulador
2. Crie um imóvel no app
3. Toque em "Enviar" — deve falhar graciosamente
4. Imóvel fica em "rascunho"
5. Desligue **Airplane Mode**
6. App re-tenta envio automaticamente

---

## Próximos passos

- Veja [DEVELOPMENT.md](./DEVELOPMENT.md) para debugging, testes e troubleshooting
- Veja [BUILDING.md](./BUILDING.md) para build em produção
- Veja [README.md](../README.md) para visão geral do projeto
- Veja [CLAUDE.md](../CLAUDE.md) para instruções da IA

---

**Dúvida?** Procure a seção relevante em `docs/` ou no [README principal](../README.md).
