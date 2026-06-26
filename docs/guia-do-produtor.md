# Guia do Produtor: Como Demarcar seu Imóvel

Bem-vindo ao CAR Campo. Este guia mostra passo a passo como desenhar o perímetro do seu imóvel caminhando com o celular.

## O que você vai fazer

1. Abrir o app e escolher seu perfil.
2. Criar um novo imóvel e preencher os dados básicos.
3. Caminhar pela divisa do imóvel enquanto o GPS marca os pontos.
4. Anexar documentos (matrícula, RG, etc.) e tirar uma foto da divisa.
5. Revisar o desenho, validar a área e enviar.

Tudo fica salvo no seu celular. Se não tiver internet, sem problema — o app guarda tudo e envia depois.

---

## Passo 1: Perfil

Ao abrir o app, escolha:

- **🌾 Produtor rural**: guias simples, linguagem clara, passo a passo descomplicado.
- **📋 Analista de campo**: mais detalhes, validação avançada, gestão de vários imóveis.

Você pode trocar de perfil depois nas configurações.

---

## Passo 2: Meus Imóveis

Você vê a lista dos imóveis que já cadastrou. Para criar um novo:

1. Toque em **"Novo imóvel"** (botão verde).
2. Preencha os dados do imóvel:
   - **Nome**: ex., "Fazenda Santa Maria" ou "Lote 15"
   - **Município / UF**: onde fica
   - **Matrícula** (opcional): número da matrícula no cartório
   - **Módulos fiscais** (opcional): quantidade (o app calcula a área mínima esperada)
3. Preencha seus dados:
   - **Nome**: seu nome completo
   - **CPF ou CNPJ**: documento da sua pessoa ou empresa
4. Toque em **"Próximo"** para ir ao mapa.

> 🔒 Seus dados (CPF/CNPJ) são protegidos — o app não compartilha com ninguém sem sua permissão.

---

## Passo 3a: Demarcação — Modo GPS Real (Caminhada)

Este é o modo principal. Você caminha pela divisa do imóvel e o GPS marca os pontos.

### Antes de sair

1. Abra o app no seu celular e vá para o mapa.
2. **Conceda acesso ao GPS** quando o app pedir permissão.
3. Espere o GPS "localizar" você (pode levar alguns segundos). Você verá um ponto azul no mapa.

### Durante a caminhada

1. Toque em **"Começar a caminhar"** (botão grande verde).
2. **Caminhe rente à divisa do imóvel** de forma segura (cuidado com fossas, vala, etc.).
3. O app marca um vértice (ponto) a cada ~5–10 metros. Você vê uma linha azul no mapa em tempo real.
4. **Nas quinas (cantos)** do imóvel, pare e toque em **"Marcar canto"** para fixar o ponto com precisão.
5. Continue caminhando até voltar ao ponto de partida.
6. Toque em **"Fechar desenho"** quando terminar.

### Dicas

- **Rede 4G/5G**: quanto melhor o sinal, mais preciso o GPS.
- **Sem nuvens**: GPS funciona melhor sem bloqueio do sinal (evite passar embaixo de árvores densas ou prédios).
- **Venda de volta ao início**: para fechar o polígono corretamente, caminhe até o ponto de partida.
- **Rápido demais**: se caminhar muito rápido, o GPS pode "perder" alguns pontos. Caminhe a passo normal.

---

## Passo 3b: Demarcação — Modo Simular Caminhada (Demo)

Não quer caminhar agora? Quer fazer uma demonstração? Use o modo **Simular caminhada**.

1. Na tela do mapa, toque em **"Simular caminhada"** (ao lado de "Começar a caminhar").
2. Escolha uma rota de demo (o app já tem rotas de exemplo).
3. O app anima um avatar 🚶 caminhando pela rota.
4. Os vértices são marcados automaticamente, sem precisar de GPS real.
5. Quando terminar, o app mostra o desenho completo.

**Quando usar:**
- Para **treinar** antes de ir a campo (aprende como funciona).
- Para **demonstrar** o app para outras pessoas (sem GPS real).
- Para **testar** em ambiente urbano (sem sair de casa).

> 💡 Depois de usar a simulação, você pode ir a campo e fazer a caminhada real com GPS. Ambos funcionam!

---

## Passo 3c: Resultado — Área e Perímetro

Depois que você fecha o desenho (real ou simulado), o app mostra:

- **Área**: em hectares (ha) — quantos hectares tem o imóvel.
- **Perímetro**: em metros (m) — o contorno todo do imóvel.
- **Vértices**: quantos pontos você marcou.

O app também valida o desenho:
- ✅ Anel fechado (voltou ao ponto de partida)
- ✅ Mínimo 3 pontos
- ✅ Sem auto-interseção (a linha não cruza a si mesma)

Se tudo estiver ok, você segue para o próximo passo.

---

## Passo 4: Documentos

Agora você anexa os documentos (são guardados no celular):

### O que você pode anexar

- **Matrícula**: foto do documento de registro do imóvel.
- **CCIR**: Certificado de Cadastro de Imóvel Rural.
- **RG/CPF**: seu documento de identidade (para validação).
- **Recibo CAR**: comprovante de cadastro no CAR (se tiver).
- **Foto da divisa**: tirar uma foto georreferenciada do imóvel (o app marca a localização automaticamente).

### Como anexar

1. Toque em **"Selecionar arquivo"** ou **"Tirar foto"**.
2. Escolha de onde pegar (câmera, galeria ou arquivos do celular).
3. Tire a foto ou selecione o arquivo.
4. O app salva tudo junto com o imóvel.

> 📷 A foto da divisa é importante: o técnico do CAR vê que o desenho bate com a realidade.

---

## Passo 5: Revisão e Envio

Última tela! Aqui você:

1. **Revisa tudo**: nome, endereço, área, perímetro, documentos.
2. **Valida o desenho**: o app avisa se algo estiver errado (ex.: área muito pequena).
3. **Exporta**: você pode:
   - **Gerar GeoJSON**: arquivo técnico da geometria (para integração com SIG, ex., QGIS).
   - **Gerar PDF/croqui**: um desenho visual bonito para anexar em processo.
   - **Compartilhar**: enviar o GeoJSON ou PDF para Whatsapp, email, etc.
4. **Envia à CAR**: toque em **"Enviar imóvel"** para mandar os dados à CAR Geo API.

### Se não tiver internet agora

Sem problema! O app salva o imóvel como "rascunho" e o mantém em fila. Quando você voltar a ter internet (4G, Wifi), o app envia automaticamente.

---

## Depois: Gerenciar Imóveis

Na tela **"Meus imóveis"** você vê:

- **🔄 Rascunho**: imóvel que ainda não foi enviado (pode editar).
- **✅ Enviado**: imóvel que já foi enviado à CAR (read-only, para referência).

Você pode:
- **Abrir**: ver o desenho e os dados novamente.
- **Editar**: mudar dados ou re-fazer a demarcação (rascunhos).
- **Deletar**: remover um imóvel do celular.

---

## Perguntas Frequentes

**P: Preciso de GPS real?**
R: Não! Use o modo "Simular caminhada" para demonstração. Mas para enviar um imóvel real à CAR, a demarcação com GPS é recomendada.

**P: E se eu sair do app no meio da caminhada?**
R: Não tem problema. O app guarda o progresso. Quando você volta, pode continuar de onde parou.

**P: Posso editar o desenho depois?**
R: Sim, enquanto o imóvel for "rascunho" você pode voltar e re-fazer a demarcação. Depois de enviado, fica como referência (não muda).

**P: Meus dados (CPF) são seguros?**
R: Sim. O app armazena tudo no seu celular de forma segura. O CPF só é enviado à CAR quando você toca em "Enviar", com proteção.

**P: Como funciona offline?**
R: Você trabalha normalmente sem internet. O app guarda tudo no celular. Quando conectar, o imóvel é enviado automaticamente. Você fica sempre no controle.

---

## Precisa de ajuda?

Se tiver dúvidas ou o app não funcionar como esperado:

1. Confirme que o **GPS está ativado** no celular.
2. Confirme que você deu **permissão de acesso ao GPS** ao app.
3. Se a linha não aparece no mapa, espere alguns segundos — o GPS pode estar "achando" sua localização.
4. Reinicie o app se algo congelar.

Boa sorte! 🌾
