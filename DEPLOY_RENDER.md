# DOGFIGHTERS — Passo a passo para publicar no Render

Você não precisa instalar nada no seu computador: basta uma conta no GitHub e uma no Render.

## 1. Colocar o projeto no GitHub
1. Crie uma conta em https://github.com (se ainda não tiver).
2. Clique em **New repository** → nome: `dogfighters` → **Public** ou **Private** → **Create repository**.
3. **Descompacte** o `dogfighters_render.zip` no seu computador.
4. Na página do repositório vazio, clique em **uploading an existing file**.
5. Abra a pasta descompactada e arraste **o conteúdo** dela (não a pasta em si) para a página:
   `package.json`, `server.js`, `render.yaml`, `README.md`, `.gitignore`, `package-lock.json`, e as pastas `public/` e `assets/`.
6. Confira que o `package.json` aparece **na raiz** do repositório (não dentro de outra pasta).
7. Clique em **Commit changes**.

> Dica: se a pasta `assets/` aparecer vazia no GitHub, tudo bem; o jogo gera sprites e sons por código.

## 2. Criar a conta no Render
1. Acesse https://render.com e clique em **Get Started**.
2. Entre com **GitHub** (mais simples) e autorize o acesso ao repositório `dogfighters`.

## 3. Criar o serviço (escolha UMA das opções)

### Opção A — Blueprint (mais rápida)
1. No painel do Render: **New +** → **Blueprint**.
2. Selecione o repositório `dogfighters` → **Connect**.
3. O Render lê o `render.yaml` sozinho. Clique em **Apply** (ou **Deploy Blueprint**).

### Opção B — Web Service manual
1. **New +** → **Web Service** → selecione o repositório `dogfighters` → **Connect**.
2. Preencha:

| Campo | Valor |
|---|---|
| Name | `dogfighters` (vira parte da URL) |
| Region | a mais próxima dos jogadores (ex.: Ohio ou Virginia, para o Brasil) |
| Branch | `main` |
| Runtime / Language | **Node** |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Free** |

3. Em **Advanced**:
   - **Health Check Path:** `/health`
   - **Environment Variables** (opcional): `NODE_VERSION` = `20`
   - **Auto-Deploy:** Yes
4. Clique em **Create Web Service**.

## 4. Acompanhar o deploy
1. A aba **Logs** mostra o build (`npm install`) e depois o início do servidor.
2. Está tudo certo quando aparecer:
   - `DOGFIGHTERS listening on port 10000`
   - `Your service is live 🎉`
3. A URL fica no topo da página, no formato `https://dogfighters-xxxx.onrender.com`.

## 5. Testar
1. Abra `https://SUA-URL.onrender.com/health` → deve mostrar `{"status":"ok", ...}`.
2. Abra a URL principal. No canto do menu deve aparecer **ONLINE** em verde.
3. Digite um nick (3 a 16 caracteres) e clique em **CRIAR SALA**. Anote o código de 5 letras.
4. Em **outro computador/celular/aba anônima**, abra a mesma URL, digite outro nick, **ENTRAR EM SALA** e informe o código.
5. Os dois nicks devem aparecer no lobby; só o host (`[HOST]`) vê **INICIAR JOGO**.

## 6. Atualizar o jogo depois
Qualquer alteração enviada ao GitHub (upload ou `git push`) faz o Render publicar de novo automaticamente. Para forçar: painel do serviço → **Manual Deploy** → **Deploy latest commit**.

## 7. Regras importantes do Render para este jogo
- **Mantenha 1 única instância** (Settings → Scaling). As salas ficam na memória do servidor; com 2+ instâncias os jogadores poderiam cair em servidores diferentes.
- **Plano Free dorme** após ~15 min sem acesso. O primeiro acesso depois disso pode levar cerca de 1 minuto: o menu mostra **OFFLINE** até acordar; recarregue a página se demorar.
- **Deploy ou reinício derruba as salas** (ficam em memória). Os jogadores voltam ao menu com "CONEXAO PERDIDA" e criam outra sala.
- Para o servidor nunca dormir e ter desempenho estável, use um plano pago (Starter).

## 8. Problemas comuns
| Sintoma | O que fazer |
|---|---|
| Build falha: `Cannot find package.json` | O `package.json` não está na raiz do repositório. Refaça o upload do conteúdo da pasta (passo 1.5). |
| Logs: `Cannot find module 'express'` ou `'phaser'` | O Build Command precisa ser `npm install`. |
| Página abre mas fica **OFFLINE** | O serviço pode estar acordando (espere ~1 min e recarregue). Se persistir, veja a aba **Logs**; redes corporativas/extensões podem bloquear WebSocket. |
| "SALA NAO ENCONTRADA" logo após um deploy | As salas foram resetadas pelo reinício. Crie uma nova sala. |
| "MUITAS TENTATIVAS: AGUARDE" | Proteção contra chute de códigos (6 erros em 30 s). Aguarde meio minuto. |
| Deploy "Failed" na health check | Confirme o Health Check Path `/health` e o Start Command `npm start`. |
| Jogo em branco | Abra o console do navegador (F12) e verifique se `/vendor/phaser/phaser.min.js` carrega (deve ser 200). |

## 9. Domínio próprio (opcional)
Painel do serviço → **Settings** → **Custom Domains** → **Add Custom Domain** e siga as instruções de DNS.
