# Consulta web da medição — design

Data: 2026-06-28 · Branch app: `feat/consulta-web` · API: master (deploy)

Página web no `car-geo-api` onde qualquer um vê a medição digitando **CPF +
código curto** — pro pitch numa tela grande, mostrando o ciclo app → API → web.

Na API só o **documento (PDF)** é persistido hoje (o write do perímetro não
existe), e o PDF já embute croqui + área + perímetro + vértices. A consulta
gira em torno do documento e reusa a página `/documentos/:id/ver`.

## Contrato

`POST /documentos` (alterado)
- body: `{ pdf_base64: string, nome?: string, cpf?: string }` (cpf = dígitos)
- gera `codigo` curto (6 chars, alfabeto sem ambíguos: `23456789ABCDEFGHJKMNPQRSTUVWXYZ`)
- guarda `codigo` e `cpf_hash = sha256(SALT + cpfDigits)`. **CPF nunca salvo cru** (LGPD).
- resposta: `{ id, codigo, url, view_url, nome, createdAt }` (view_url = `…/documentos/:id/ver`)

`GET /consulta`
- página HTML (marca CAR Campo) com dois campos: **CPF** e **Código** + JS.

`POST /consulta/lookup`
- body: `{ cpf: string, codigo: string }`
- acha o documento por `codigo`; se tiver `cpf_hash`, exige `sha256(SALT+cpf)` igual.
- ok → `{ ok: true, id, view_url }`; falha → 404 `{ ok: false }`.
- a página JS então redireciona para `view_url`; erro → mensagem amigável.

## Persistência (`documents.ts`)
- `ensureDocumentSchema`: `ADD COLUMN IF NOT EXISTS codigo TEXT`, `cpf_hash TEXT`;
  índice único em `codigo`.
- `saveDocument` aceita `codigo` e `cpfHash`.
- `getDocumentByCodigo(codigo)` → `{ id, cpf_hash } | null`.
- helper de hash com `SALT` (constante do módulo; nota: produção usaria env).

## App (`car-campo-app`)
- `export.ts > uploadPDFLink`: envia `cpf` (dígitos de `imovel.produtor.cpfCnpj`);
  passa a retornar `{ codigo, viewUrl, consultaUrl }` (consultaUrl = `${API_BASE_URL}/consulta`).
- `DocumentosScreen.gerarLink` e `RevisaoScreen.handleGerarLink`: o alerta passa a
  mostrar **Código** + link da consulta + "use seu CPF"; botões Abrir (viewUrl),
  Compartilhar (mensagem com código + consultaUrl), Fechar.

## Não-objetivos
- Não implementar o write de perímetro (`/collections/imovel/items`).
- Sem login/sessão na web; o "gate" é CPF + código (demo).
- Não persistir CPF em claro; só o hash.
