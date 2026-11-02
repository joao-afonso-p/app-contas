# Contas

Aplicação web de gestão de finanças pessoais: planeamento mensal por baldes, gastos reais, poupança, investimento e projeções. Funciona offline, instala-se como PWA e pode sincronizar entre dispositivos.

**App:** [asminhascontas.com](https://asminhascontas.com)

## Funcionalidades

- **Planeamento**: rendimentos, despesas e baldes de poupança por mês, com uma barra de alocação até 100%.
- **Movimentos e Gastos**: entradas, saídas e transferências entre baldes; importação de extratos (PDF, Excel ou texto) com sugestão de categoria e deteção de duplicados; ligação de gastos a movimentos de poupança.
- **Projeções**: grelha editável mês a mês, objetivos com meta e prazo, movimentos previstos que se podem ligar a saídas reais.
- **Analytics, Investimento e Overview**: planeado vs. real, veículos de investimento com checkpoints e simulador, saldo total ao longo do tempo.
- **Guia e visitas guiadas**: guia dentro da app (também em PDF), onboarding interativo e desbloqueio progressivo das partes avançadas.
- **PWA**: o desktop tem a versão completa; o telemóvel cobre o essencial do dia a dia.

## Stack

React 19, Vite, TypeScript, Tailwind CSS v4, Zustand, Recharts, `vite-plugin-pwa`, Vitest. Dados em IndexedDB (`idb`) ou Firestore (Firebase, com autenticação anónima).

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes (Vitest)
npm run build      # typecheck + build de produção
```

Sem configuração, a app corre em modo local. Para testar a sincronização, copia `.env.example` para `.env` e preenche as variáveis.

| Variável | Para quê |
| --- | --- |
| `VITE_FIREBASE_*` (6 variáveis) | Config do projeto Firebase. Sem elas, só há modo local. |
| `VITE_PREMIUM_CODES` | Códigos de uso único para criar espaços sincronizados. Opcional. |
| `VITE_GOATCOUNTER_CODE` | Estatísticas anónimas. Só entra no build de produção. |
| `VITE_BASE` | Base path do build (`/` em produção). |

## Arquitetura

```
src/
  types.ts               modelo de dados
  lib/
    calc/                lógica pura e testada: alocação, saldos, projeções,
                         categorias, deduplicação, ligações movimento/previsto
    ai/                  extração de extratos (PDF/Excel) com a chave do utilizador
    unlock.ts, coach.ts  desbloqueio progressivo e visitas guiadas
    backup.ts            exportar e importar cópias de segurança
  data/
    adapter.ts           interface DataAdapter
    localAdapter.ts      IndexedDB (por defeito, 100% offline)
    firebaseAdapter.ts   Firestore em tempo real
  store/                 Zustand: estado, ações e seeds
  screens/               um ficheiro por ecrã
  components/            UI base e componentes partilhados
  content/               guia e visitas guiadas (dados, com testes)
data/marta/              backup de demonstração (9 meses)
scripts/                 geração do PDF do guia e dos dados de demonstração
```

Princípios:

- **Saldos sempre calculados**, nunca escritos à mão: `saldo(mês) = saldo(mês − 1) + alocado no planeamento + movimentos do mês`. As projeções reutilizam o mesmo motor, separando a realidade confirmada do futuro projetado.
- **Lógica em `lib/calc`**: funções puras, sem acesso a dados nem a UI, cobertas por testes.
- **Dados atrás de um adapter**: o resto da app não sabe se está em modo local ou sincronizado.
- **Alterações aditivas**: campos novos são opcionais, para nunca invalidar dados existentes.

## Dados e sincronização

- **Modo local**: IndexedDB no próprio dispositivo. Tem exportação e importação de backup (Definições → Dados), em JSON.
- **Modo sincronizado**: espaço no Firestore identificado por um código longo e aleatório. As regras (`firestore.rules`) exigem autenticação anónima, e a privacidade assenta no código ser secreto. Ao entrar num espaço vazio, os dados locais migram automaticamente.
- Os dados locais e as preferências do browser são por endereço (origem). Mudar de domínio exige exportar e importar um backup.

## Deploy

O workflow [`deploy.yml`](.github/workflows/deploy.yml) faz o build e publica no GitHub Pages a cada push para `main`. Usa secrets do repositório para as variáveis `VITE_*`. O domínio próprio configura-se em Settings → Pages (registos `A` e `CNAME` no DNS), com `public/CNAME` no repositório, e o domínio tem de constar dos domínios autorizados do Firebase Authentication.

## Guia e dados de demonstração

O conteúdo do guia vive em `src/content/guide.ts`. Para regenerar o PDF (`public/guia-contas.pdf`):

```bash
node scripts/dump-guide.cjs
python3 scripts/build-guide-pdf.py
```

`data/marta/` tem um backup realista para mostrar a app sem dados pessoais (ver o README dessa pasta).
