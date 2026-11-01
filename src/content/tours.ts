import type { Screen } from '../store/useStore'

// Visitas guiadas. Cada passo pode apontar a um elemento da página (atributo
// data-coach="..."): o ecrã escurece e só esse elemento fica destacado. Sem alvo,
// ou se o alvo não existir (ex.: no telemóvel), o passo aparece ao centro.
// Texto: sem travessões longos; frases curtas.

export interface TourStep {
  title: string
  text: string
  // Valor do atributo data-coach do elemento a destacar. Se houver vários
  // (menu lateral e barra de baixo), usa-se o que estiver visível.
  target?: string | string[]
  // Ecrã que tem de estar aberto neste passo (a visita navega para lá).
  screen?: Screen
}

export interface Tour {
  id: string
  title: string
  // Ecrã onde a visita é oferecida na primeira vez (só visitas por ecrã).
  offerOn?: Screen
  steps: TourStep[]
}

export const TOURS: Tour[] = [
  {
    id: 'inicio',
    title: 'Visita guiada à Contas',
    steps: [
      {
        screen: 'overview',
        title: 'Bem-vindo à Contas',
        text: 'Em um minuto mostro-te onde está cada coisa. Podes sair quando quiseres e repetir esta visita em Definições.',
      },
      {
        screen: 'overview',
        target: 'overview-cards',
        title: 'O teu dinheiro num olhar',
        text: 'Aqui vês o Total poupado, o que está na conta poupança, o que está investido e a tua taxa de poupança do mês.',
      },
      {
        target: 'nav-planeamento',
        title: 'Planeamento',
        text: 'É aqui que decides o mês: de onde entra o dinheiro e para onde vai. É o centro da Contas.',
      },
      {
        screen: 'planeamento',
        target: 'plan-summary',
        title: 'A alocação tem de chegar a 100%',
        text: 'Distribui todo o rendimento por despesas, baldes de poupança e investimentos. Estes cartões dizem quanto deixar na conta corrente e quanto transferir para a poupança.',
      },
      {
        screen: 'planeamento',
        target: 'plan-apply',
        title: 'Aplicar o plano',
        text: 'Quando a alocação está em 100%, aplica o plano. A partir daí, os saldos dos baldes passam a contar o que planeaste.',
      },
      {
        target: 'nav-movimentos',
        title: 'Movimentos',
        text: 'Aqui registas o dinheiro que se mexe entre baldes: depósitos, saídas e transferências.',
      },
      {
        target: 'nav-gastos',
        title: 'Gastos',
        text: 'Importa o extrato do banco e dá uma categoria a cada gasto. É assim que a Contas compara o planeado com o real.',
      },
      {
        target: ['nav-guia', 'nav-definicoes'],
        title: 'O Guia explica tudo',
        text: 'Tem o essencial e o avançado, com o exemplo de uma pessoa fictícia, a Marta. As palavras sublinhadas têm explicação. No telemóvel, abre-se em Definições.',
      },
      {
        screen: 'planeamento',
        title: 'Por onde começar',
        text: 'Começa por planear este mês em Planeamento. Investimento, Analytics e Projeções abrem aos poucos, e eu aviso-te quando abrirem.',
      },
    ],
  },
  {
    id: 'investimentos',
    title: 'Visita ao Investimento',
    offerOn: 'investimentos',
    steps: [
      {
        screen: 'investimentos',
        title: 'Investimento',
        text: 'Aqui acompanhas o dinheiro investido: o total, os ganhos e a taxa anual de cada veículo (corretora, PPR, certificados).',
      },
      {
        screen: 'investimentos',
        target: 'inv-add',
        title: 'Cria um veículo',
        text: 'Um veículo é onde está investido o dinheiro. Dentro dele podes ter vários ativos.',
      },
      {
        screen: 'investimentos',
        title: 'Checkpoints',
        text: 'De vez em quando, regista o valor atual de um veículo ou ativo (um checkpoint). É assim que a Contas calcula o ganho.',
      },
    ],
  },
  {
    id: 'budgets',
    title: 'Visita ao Analytics',
    offerOn: 'budgets',
    steps: [
      {
        screen: 'budgets',
        title: 'Analytics',
        text: 'Compara, para cada categoria, o que planeaste com o que realmente gastaste, mês a mês.',
      },
      {
        screen: 'budgets',
        target: 'analytics-attention',
        title: 'Atenção',
        text: 'Avisa quando uma categoria vai acima do ritmo do mês, está acima do plano há três meses seguidos, ou há gastos por classificar.',
      },
      {
        screen: 'budgets',
        title: 'Plano desatualizado?',
        text: 'Se uma categoria está sempre acima do plano porque os preços mudaram, o mais honesto é atualizar o plano em vez de tentar gastar menos.',
      },
    ],
  },
  {
    id: 'projecoes',
    title: 'Visita às Projeções',
    offerOn: 'projecoes',
    steps: [
      {
        screen: 'projecoes',
        title: 'Projeções',
        text: 'Mostram como ficam os teus baldes nos próximos meses, a partir do plano atual.',
      },
      {
        screen: 'projecoes',
        target: 'proj-actions',
        title: 'Acrescenta o que já sabes',
        text: 'Com "+ Movimento" e "+ Objetivo" juntas despesas e metas futuras (uma viagem, um seguro anual) e vês o efeito nos saldos.',
      },
      {
        screen: 'projecoes',
        title: 'Sincronizar com a realidade',
        text: 'Quando a realidade se afasta da projeção, "Sincronizar com a realidade" volta a ancorá-la nos saldos reais, mantendo as tuas alterações ao futuro.',
      },
    ],
  },
]

export const tourById = (id: string): Tour | undefined => TOURS.find((t) => t.id === id)
export const tourForScreen = (screen: Screen): Tour | undefined => TOURS.find((t) => t.offerOn === screen)
