// Conteúdo do guia do utilizador. Texto simples: **negrito** é a única marcação.
// Regra de escrita: sem travessões longos; frases curtas; nomes exatos dos botões e ecrãs.

export type Block =
  | { t: 'p'; text: string }
  | { t: 'steps'; items: string[] }
  | { t: 'list'; items: string[] }
  | { t: 'tip'; text: string }

export interface GuideSub {
  title: string
  blocks: Block[]
}

export interface GuideSection {
  id: string
  title: string
  kicker: string
  summary: string
  blocks: Block[]
  subs?: GuideSub[]
}

export const GUIDE: GuideSection[] = [
  {
    id: 'comecar',
    title: 'Começar',
    kicker: 'Essencial',
    summary: 'A ideia da app e o ciclo do mês, em cinco passos.',
    blocks: [
      {
        t: 'p',
        text: 'A Contas parte de uma ideia simples: **primeiro decides para onde vai o dinheiro (o plano), depois registas o que aconteceu e comparas.** Os saldos nunca são escritos à mão: são sempre calculados a partir do plano e dos movimentos.',
      },
      { t: 'p', text: 'Cada mês segue o mesmo ciclo:' },
      {
        t: 'steps',
        items: [
          '**Planeia o mês** em Planeamento: rendimentos, despesas, poupanças e investimentos, até a alocação chegar a 100%.',
          '**Aplica o plano** com o botão "Aplicar plano". A partir daí, os saldos dos baldes passam a contar o que planeaste.',
          '**Faz as transferências no banco**: o cartão "Transferir agora para a poupança" diz quanto passar da conta corrente.',
          '**Durante o mês**, importa o extrato em Gastos e põe cada gasto na sua categoria.',
          '**Revê** no Overview e no Analytics: o que planeaste contra o que realmente gastaste.',
        ],
      },
      {
        t: 'tip',
        text: 'Não precisas de registar cada café. O plano diz o que esperas gastar por categoria, e o extrato do banco mostra o que aconteceu. Importar o extrato uma vez por semana chega.',
      },
    ],
    subs: [
      {
        title: 'Primeira configuração',
        blocks: [
          {
            t: 'p',
            text: 'Na primeira vez, a app guia-te por um pequeno onboarding. Cria só o que precisas, porque podes editar tudo mais tarde em Definições.',
          },
          {
            t: 'list',
            items: [
              '**Fontes de rendimento**: de onde entra dinheiro todos os meses (ex.: salário, renda).',
              '**Despesas**: as categorias do teu orçamento mensal (ex.: Casa, Carro, Lazer). Podes detalhar cada uma em subcategorias.',
              '**Baldes de poupança**: onde guardas o dinheiro poupado. "Fixo" é para poupança contínua e "Objetivo" é para uma meta com valor e data.',
              '**Veículos de investimento**: só para acompanhares o total investido fora da app (ex.: ETFs, Certificados de Aforro).',
            ],
          },
          {
            t: 'p',
            text: 'Os valores atuais que indicares ficam registados como o saldo no fim do mês passado.',
          },
        ],
      },
      {
        title: 'Instalar a app e guardar uma cópia',
        blocks: [
          {
            t: 'p',
            text: '**Instala a Contas no ecrã principal** do telemóvel ou do computador e usa sempre essa app. Os dados guardados no browser não passam para a app instalada, por isso instala antes de preencheres.',
          },
          {
            t: 'p',
            text: 'Em Definições → Dados podes **exportar uma cópia de segurança** num ficheiro. Faz isto de vez em quando e sempre antes de mudares de dispositivo. O ficheiro tem os teus dados financeiros: guarda-o em privado.',
          },
        ],
      },
    ],
  },
  {
    id: 'dia-a-dia',
    title: 'Dia a dia',
    kicker: 'Uso diário',
    summary: 'Registar gastos, movimentos e saber onde está o dinheiro.',
    blocks: [
      {
        t: 'p',
        text: 'No dia a dia só há duas coisas a manter em ordem: os **gastos** (o que saiu da conta) e os **movimentos** (o dinheiro que se mexe entre baldes de poupança).',
      },
    ],
    subs: [
      {
        title: 'Registar gastos',
        blocks: [
          {
            t: 'p',
            text: 'Em Gastos, usa "Importar extrato" e envia o PDF ou Excel do banco. A app extrai as linhas e sugere uma categoria para cada uma. **Revês tudo antes de importar** e o ficheiro não é guardado em lado nenhum.',
          },
          {
            t: 'p',
            text: 'A importação usa IA (OpenAI) com a tua própria chave, que guardas em Definições → OpenAI. É opcional. A app avisa se uma linha parece repetida de um gasto que já tens.',
          },
          { t: 'tip', text: 'A importação de extratos está disponível no computador. No telemóvel consultas tudo, mas não importas.' },
        ],
      },
      {
        title: 'Dar categoria aos gastos',
        blocks: [
          {
            t: 'p',
            text: 'Cada gasto tem uma **categoria do plano**, que é a mesma categoria que planeaste em Planeamento. É assim que a app compara o planeado com o real. A subcategoria é opcional e serve para detalhar (ex.: Casa → Eletricidade).',
          },
          {
            t: 'p',
            text: 'Gastos sem categoria aparecem num aviso e não contam em nenhuma despesa planeada. Para muitos de uma vez, seleciona-os e usa a edição em grupo.',
          },
        ],
      },
      {
        title: 'Gasto pago pela poupança',
        blocks: [
          {
            t: 'p',
            text: 'Quando um gasto sai da poupança (e não do orçamento do mês), escolhe como categoria um balde de poupança, por exemplo Geral. Esse gasto **não conta contra o orçamento do mês**.',
          },
          {
            t: 'p',
            text: 'Isto não mexe no saldo do balde. Para a poupança refletir a saída, usa "Criar movimento de poupança" no gasto e confirma. A app pede confirmação em dois passos para não criares movimentos por engano.',
          },
        ],
      },
      {
        title: 'Movimentos',
        blocks: [
          {
            t: 'p',
            text: 'Em Movimentos usas "+ Movimento" para registar depósitos, saídas e **transferências entre baldes**. O saldo de cada balde é sempre: o que foi planeado mais os movimentos.',
          },
        ],
      },
      {
        title: 'Onde está o dinheiro',
        blocks: [
          {
            t: 'p',
            text: 'O **Overview** responde a isso num olhar: Total poupado, Na conta do banco, Investidos e Taxa de poupança do mês. Por baixo vês cada balde e a evolução ao longo do tempo.',
          },
          {
            t: 'p',
            text: 'O valor "Na conta do banco" é o que a app espera ver na conta. Se for diferente do banco, o ícone de ajuda explica porquê (por exemplo, uma renda que ainda não chegou).',
          },
        ],
      },
    ],
  },
  {
    id: 'semana',
    title: 'Semana',
    kicker: 'Cinco minutos por semana',
    summary: 'Uma rotina curta para manter tudo certo.',
    blocks: [
      { t: 'p', text: 'Uma vez por semana, no computador:' },
      {
        t: 'steps',
        items: [
          '**Importa o extrato** em Gastos desde a última vez.',
          '**Classifica** os gastos sem categoria. O aviso no topo diz quantos faltam.',
          '**Vê a secção "Atenção"** no Overview: avisa quando uma categoria está acima do ritmo do mês ou quando há gastos por classificar.',
          '**Confirma rendas que chegaram depois do salário**: em "A transferir quando chegar", usa "Já transferi" quando passares o valor para a poupança.',
          '**Compara o saldo** "Na conta do banco" com o banco. Se houver diferença, procura o gasto ou movimento em falta.',
        ],
      },
    ],
  },
  {
    id: 'mes',
    title: 'Mês',
    kicker: 'Fecho e novo plano',
    summary: 'Rever o mês que acabou e preparar o próximo.',
    blocks: [
      { t: 'p', text: 'Perto do fim do mês financeiro, faz este fecho:' },
      {
        t: 'steps',
        items: [
          '**Revê o mês** em Analytics: o plano contra o real por categoria, e o que ficou fora do plano.',
          '**Prepara o plano seguinte** em Planeamento: ajusta rendimentos, despesas e poupanças. A alocação tem de chegar a 100% para poderes aplicar.',
          '**Aplica o plano** quando puderes. O botão só abre a partir de 3 dias antes de o mês começar (e nunca depois do dia 25).',
          '**Faz as transferências** no banco: deixa o valor de "Deixar na conta corrente" e transfere o de "Transferir agora para a poupança".',
          '**Exporta uma cópia de segurança** em Definições → Dados.',
        ],
      },
    ],
    subs: [
      {
        title: 'Rendimentos que chegam depois do salário',
        blocks: [
          {
            t: 'p',
            text: 'Se um rendimento (por exemplo uma renda) só chega depois do salário, marca-o como "Chega depois" em "Quando chega?". Esse valor **não entra na transferência de agora**: transferes só o resto e, quando ele chegar, passas-o para a poupança.',
          },
          {
            t: 'p',
            text: 'Conta sempre para o total de rendimento e para a alocação de 100%. O dia previsto é só um lembrete.',
          },
        ],
      },
      {
        title: 'O mês financeiro',
        blocks: [
          {
            t: 'p',
            text: 'Por defeito o mês começa no dia 1. Se recebes o salário a meio ou no fim do mês, podes começar o mês financeiro nessa data. Define o padrão em Definições → Início do mês financeiro.',
          },
          {
            t: 'p',
            text: 'Os dias possíveis vão do dia 20 do mês anterior até ao dia 5. Para mudar só um mês, abre esse mês em Planeamento e usa "alterar" ao lado das datas (no computador).',
          },
        ],
      },
    ],
  },
  {
    id: 'avancado',
    title: 'Avançado',
    kicker: 'Quando já dominas o resto',
    summary: 'Analytics, Projeções, Investimento e outras ferramentas.',
    blocks: [
      {
        t: 'p',
        text: 'Estas partes não são precisas no início. Vale a pena voltar a elas depois de um ou dois meses a usar a app.',
      },
    ],
    subs: [
      {
        title: 'Analytics',
        blocks: [
          {
            t: 'p',
            text: 'Mostra, para cada categoria, o **plano contra o real**, mês a mês, e o que ficou "Fora do plano" (gastos pagos pela poupança ou sem categoria).',
          },
          {
            t: 'list',
            items: [
              'A secção **Atenção** avisa de categorias acima do ritmo, acima do plano três meses seguidos, ou gastos sem categoria.',
              'Se uma categoria tem subcategorias, podes ver o detalhe por subcategoria.',
              'Marca uma categoria com a estrela para ela abrir por defeito no gráfico.',
              'Podes ignorar um alerta que não te interessa. A app pede confirmação.',
            ],
          },
        ],
      },
      {
        title: 'Projeções',
        blocks: [
          {
            t: 'p',
            text: 'A projeção usa o **plano atual como base para os meses futuros**. Podes editar qualquer célula para refletir o que já sabes que vai acontecer (uma viagem, um seguro anual, um carro novo).',
          },
          {
            t: 'list',
            items: [
              '"+ Movimento" acrescenta um movimento previsto a um mês futuro. Quando acontecer, regista-o em Movimentos e marca-o como feito, para não contar a dobrar.',
              '"+ Objetivo" cria uma meta com valor e data, e a app diz quanto poupar por mês.',
              '"Sincronizar com a realidade" volta a ancorar a projeção nos saldos reais, mantendo as tuas alterações ao futuro.',
              '"Saldos projetados" avisa se algum balde vai ficar negativo.',
            ],
          },
        ],
      },
      {
        title: 'Investimento',
        blocks: [
          {
            t: 'p',
            text: 'Um **veículo** é onde está investido o dinheiro (por exemplo uma corretora ou um PPR). Dentro dele podes ter vários **ativos**.',
          },
          {
            t: 'list',
            items: [
              '**Checkpoint**: regista o valor atual de um veículo ou ativo numa data. O ganho e a taxa anualizada calculam-se a partir dos checkpoints. Atualiza-os de vez em quando: a app avisa quando o último tem mais de seis meses.',
              '**Distribuir**: reparte o "saldo livre" do veículo (dinheiro ainda não atribuído a nenhum ativo) pelos ativos.',
              '**Movimento direto**: depósitos e resgates que entram ou saem do veículo.',
              '**Projeção por ativo**: indica a taxa anual esperada, a entrada mensal e o aumento anual para ver onde podes chegar.',
            ],
          },
        ],
      },
      {
        title: 'Gastos em detalhe',
        blocks: [
          {
            t: 'list',
            items: [
              'A lista mostra sempre os 150 gastos mais recentes. Usa "Mostrar mais" para ver mais.',
              'Filtra por mês, categoria ou subcategoria.',
              'Clica num gasto para editar o nome, a categoria ou a subcategoria.',
              '"Exportar CSV" guarda os gastos num ficheiro.',
            ],
          },
        ],
      },
      {
        title: 'Definições úteis',
        blocks: [
          {
            t: 'list',
            items: [
              '**Renomear**: usa o lápis ao lado do nome de uma categoria, balde, veículo ou ativo. O histórico mantém-se.',
              '**Arquivar** em vez de apagar: uma linha arquivada deixa de aparecer, mas o histórico fica. Tem de estar a 0 no mês atual e nos futuros.',
              '**Despesas antigas com valores**: associa categorias antigas às categorias do plano, para os gastos antigos contarem no Analytics.',
              '**Sincronização**: cria um espaço partilhado para usares a app em vários dispositivos ou em família. É identificado por um código secreto. Quem tiver o código vê os mesmos dados.',
              '**Saídas de poupança automáticas**: limpa movimentos que versões antigas criaram sozinhos ao categorizar gastos.',
            ],
          },
        ],
      },
    ],
  },
]

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Porque é que não consigo aplicar o plano?',
    a: 'Há duas razões possíveis. A alocação tem de estar em 100%, sem diferença. E só podes aplicar o plano a partir de 3 dias antes de o mês financeiro começar, e depois de aplicares os meses anteriores.',
  },
  {
    q: 'O saldo "Na conta do banco" não bate com o banco.',
    a: 'Procura um gasto por importar, um movimento por registar ou um rendimento que ainda não chegou (o ícone de ajuda no cartão lista o que está pendente). Se for um erro antigo, podes forçar o saldo de um balde no Overview.',
  },
  {
    q: 'Posso usar a app no telemóvel?',
    a: 'Sim. No telemóvel consultas o Overview, o Planeamento (só leitura), os Movimentos e os Gastos. Editar o plano e importar extratos faz-se no computador.',
  },
  {
    q: 'Os meus dados estão seguros?',
    a: 'Por defeito ficam só no teu dispositivo, sem conta nem servidor. Se ligares um espaço partilhado, ficam também guardados na nuvem, protegidos por um código secreto que só tu partilhas. Faz cópias de segurança de vez em quando.',
  },
  {
    q: 'Mudei de telemóvel. Como levo os dados?',
    a: 'No dispositivo antigo, exporta uma cópia em Definições → Dados. No novo, instala a app e importa o ficheiro. Se usas um espaço partilhado, basta introduzir o código.',
  },
  {
    q: 'Apaguei uma categoria e perdi o histórico?',
    a: 'Não. Uma categoria com gastos não se apaga, só se arquiva. Arquivar esconde a linha mas mantém o histórico.',
  },
]

export const GLOSSARY: { term: string; def: string }[] = [
  { term: 'Alocação', def: 'A distribuição do rendimento do mês por despesas, poupanças e investimentos. Tem de chegar a 100%.' },
  { term: 'Aplicar plano', def: 'Confirmar o plano do mês. A partir daí os saldos dos baldes contam o planeado.' },
  { term: 'Balde', def: 'Um sítio onde guardas dinheiro poupado, como um fundo de emergência. Pode ser fixo ou um objetivo.' },
  { term: 'Chega depois', def: 'Rendimento que entra depois do salário. Não conta para a transferência de agora, mas conta para os 100%.' },
  { term: 'Checkpoint', def: 'O valor de um investimento numa data. Serve para calcular ganho e taxa anualizada.' },
  { term: 'Débito automático', def: 'Dinheiro que sai da conta direto para um veículo de investimento, sem passar pelos baldes.' },
  { term: 'Fora do plano', def: 'Gastos que não contam contra o orçamento do mês: pagos pela poupança ou sem categoria.' },
  { term: 'Mês financeiro', def: 'O período que a app trata como "um mês". Por defeito é o mês do calendário, mas pode começar noutro dia.' },
  { term: 'Objetivo', def: 'Um balde com valor e data (por exemplo, um carro novo). A app diz quanto poupar por mês.' },
  { term: 'Saldo livre', def: 'Dinheiro de um veículo ainda não atribuído a nenhum ativo.' },
  { term: 'Veículo', def: 'Onde está investido o dinheiro (corretora, PPR, certificados). Contém um ou mais ativos.' },
]
