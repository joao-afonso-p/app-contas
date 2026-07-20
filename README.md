# Contas

App privada de gestão de finanças pessoais para 2 pessoas — uma reimaginação moderna da folha de Excel "Contas Inês e João". Sem logins: a partilha faz-se por um **código de espaço** secreto.

- **Desktop**: versão completa (Planeamento, Movimentos, Gastos, Budgets, Projeções, Overview).
- **Mobile (PWA)**: o essencial do dia-a-dia — registar gastos e movimentos, ver saldos e os números-chave do mês.
- **Offline-first**: funciona sem rede e sincroniza quando voltar a haver ligação.

## Stack

React 19 + Vite + TypeScript · Tailwind CSS v4 · Zustand · Recharts · Firebase (Firestore + Anonymous Auth) · IndexedDB (`idb`) · vite-plugin-pwa · Vitest.

## Correr localmente

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # testes dos módulos de cálculo
npm run build    # typecheck + build de produção
```

Sem configurar nada, a app corre em **modo local** (IndexedDB). No primeiro arranque escolhe "Começar com dados de exemplo" para veres tudo preenchido com seeds realistas.

## Arquitetura

```
src/
  types.ts               # modelo de dados (tudo tipado)
  lib/
    format.ts            # €, datas e meses em pt-PT
    calc/                # lógica pura e testada (Vitest)
      allocation.ts      #   alocação do mês, "deixar na conta", "transferir p/ poupança"
      balances.ts        #   saldos SEMPRE calculados (plano + movimentos + overrides)
      projections.ts     #   projeções, objetivos, viagens, poupança mensal necessária
      budgets.ts         #   gastos por categoria, tetos, parse de extrato, aprendizagem
  data/
    adapter.ts           # interface DataAdapter
    localAdapter.ts      # IndexedDB (default, 100% offline)
    firebaseAdapter.ts   # Firestore em tempo real (código de espaço)
  store/                 # Zustand + seeds
  screens/               # 1 ficheiro por ecrã
  components/            # ui base (Card, MoneyCell, ProgressBar, …)
```

**Princípio central**: os saldos nunca são escritos à mão. `saldo(mês) = saldo(mês−1) + alocado no planeamento + movimentos do mês`, com *overrides* opcionais ("a partir deste mês o saldo é X") usados nas projeções e no botão **Sincronizar com a realidade**.

## Configurar o Firebase (sincronização entre dispositivos)

1. Cria um projeto em [console.firebase.google.com](https://console.firebase.google.com) (podes desativar o Analytics).
2. **Firestore Database** → Criar base de dados → modo produção.
3. **Authentication** → Sign-in method → ativa **Anonymous**.
4. Separador **Regras** do Firestore → cola o conteúdo de [`firestore.rules`](firestore.rules) e publica.
5. Definições do projeto → As tuas apps → adiciona uma **app Web** → copia a config.
6. `cp .env.example .env` e preenche as variáveis `VITE_FIREBASE_*`.
7. `npm run dev` → Definições → **Criar espaço novo**. Copia o código gerado e introduce-o no outro dispositivo ("Entrar com código existente" ou no ecrã inicial).

**Modelo de segurança**: as regras exigem autenticação (anónima e invisível para vocês); a privacidade assenta no código de espaço ser longo, aleatório e secreto (ex.: `k7m2-9xqa-4pl3-vn8w`). Adequado para uso doméstico — não partilhes o código.

Ao entrar num espaço vazio, a app **migra automaticamente os dados locais** para o espaço.

### Códigos de acesso premium

Para dares acesso gratuito à sincronização a outras pessoas (ex.: um casal amigo), sem sistema de
pagamento nenhum: define `VITE_PREMIUM_CODES` no `.env` com uma lista de códigos separados por
vírgulas (ex.: `VITE_PREMIUM_CODES=abcd-1234,efgh-5678`). Cada código só pode ser usado **uma vez**
para criar um espaço sincronizado novo (ecrã inicial → "Criar um espaço novo", ou Definições →
"Criar espaço novo"); depois disso fica inválido. Só é preciso 1 código por casal/agregado — a
segunda pessoa entra no mesmo espaço com o código de sincronização gerado (não precisa de outro
código de acesso). Podes ver quais códigos já foram usados e quando na consola Firebase, coleção
`premiumCodeRedemptions`.

Nota: como esta app é um site estático (sem servidor), esta lista fica no bundle final e é
tecnicamente extraível por alguém com conhecimentos técnicos — mas como cada código só serve uma
vez, isso só permite "roubar" um código ainda não usado, nunca reutilizar um já gasto.

## Deploy no GitHub Pages

1. Cria um repositório no GitHub e faz push do projeto para o branch `main`.
2. No repositório: **Settings → Pages → Source: GitHub Actions**.
3. (Para sincronização) **Settings → Secrets and variables → Actions** → adiciona os 6 secrets `VITE_FIREBASE_*` com os valores do teu `.env`, e opcionalmente `VITE_PREMIUM_CODES` se quiseres dar acesso premium a alguém.
4. O workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) faz build e publica a cada push para `main`. O base path é definido automaticamente como `/<nome-do-repo>/`.

A app fica em `https://<utilizador>.github.io/<nome-do-repo>/`.

> Firebase → Authentication → Settings → **Authorized domains**: adiciona `<utilizador>.github.io`.

## Instalar como app no iPhone

1. Abre o URL no **Safari**.
2. Botão de partilha → **Adicionar ao ecrã principal**.
3. A app "Contas" abre em ecrã inteiro, como nativa, e funciona offline.

No Mac (Chrome/Edge/Safari): ícone de instalação na barra de endereço.

## Notas de uso

- **Início do mês**: abre o Planeamento, ajusta os valores e leva a barra de alocação a 100%. Os dois números do topo dizem-te quanto deixar na conta corrente e quanto transferir já para a poupança (as rendas são descontadas porque se transferem quando chegarem).
- **Objetivos extraordinários** (baldes com alvo e prazo): barra de progresso, pagamento parcial/total, concluir, adiar.
- **Gastos → Importar extrato**: cola linhas `data;descrição;valor` — a app sugere categorias e aprende com as tuas correções.
- **Projeções**: grelha editável mês a mês; viagens vivem dentro do balde "Viajar" com pagamentos faseados; usa "Sincronizar com a realidade" quando as projeções destoarem.
