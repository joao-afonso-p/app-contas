// Conteúdo do guia do utilizador.
// Marcação suportada nos textos:
//   **negrito**
//   [[balde]] ou [[baldes|balde]]  -> palavra sublinhada que abre a definição do glossário
//                                     (texto visível | chave do glossário)
// Regra de escrita: sem travessões longos; frases curtas; nomes exatos dos botões e ecrãs.

export type Block =
  | { t: 'p'; text: string }
  | { t: 'steps'; items: string[] }
  | { t: 'list'; items: string[] }
  | { t: 'tip'; text: string }
  | { t: 'example'; text: string; items?: string[] }

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
    summary: 'A ideia da app, três conceitos, o ciclo do mês e um caso concreto.',
    blocks: [
      {
        t: 'p',
        text: 'A Contas parte de uma ideia simples: **primeiro decides para onde vai o dinheiro (o [[plano]]), depois registas o que aconteceu e comparas.** Os saldos nunca são escritos à mão: são sempre calculados a partir do plano e dos movimentos.',
      },
      {
        t: 'tip',
        text: 'As palavras sublinhadas têm explicação: toca ou clica nelas para ver. No fim do guia está o glossário completo.',
      },
    ],
    subs: [
      {
        title: 'Três ideias para começar',
        blocks: [
          {
            t: 'list',
            items: [
              '**Conta corrente**: a conta do dia a dia, de onde pagas as despesas.',
              '**Poupança**: o dinheiro que guardas à parte, por exemplo numa conta poupança. Na Contas esse dinheiro está dividido em [[baldes|balde]]. Cada balde é uma divisão virtual (por exemplo Emergência, Férias, Carro). O dinheiro está todo na mesma conta do banco, e é a Contas que sabe quanto pertence a cada balde.',
              '**Plano do mês**: a decisão de quanto do rendimento vai para despesas, para cada balde e para investimentos.',
            ],
          },
        ],
      },
      {
        title: 'O ciclo do mês',
        blocks: [
          { t: 'p', text: 'Cada mês segue o mesmo ciclo:' },
          {
            t: 'steps',
            items: [
              '**Planeia o mês** em Planeamento: rendimentos, despesas, poupanças e investimentos, até a [[alocação]] chegar a 100%.',
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
      },
      {
        title: 'Conhece a Marta',
        blocks: [
          {
            t: 'p',
            text: 'Para mostrar a app a funcionar, este guia segue uma pessoa fictícia. A **Marta** tem 34 anos, vive no Porto e recebe 1 800 € de salário líquido por mês. Aluga um quarto da casa e recebe 300 € de renda, por volta do dia 8. Vais ver o caso dela em quadros como o seguinte, ao longo do guia.',
          },
          {
            t: 'example',
            text: 'O plano mensal da Marta:',
            items: [
              '**Rendimentos** (2 100 €): Salário 1 800 € (chega com o salário) e Renda do quarto 300 € ([[chega depois|chega depois]]).',
              '**Despesas** (1 240 €): Casa 650 €, Supermercado 280 €, Lazer 120 €, Transportes 90 €, Seguros 60 €, Saúde 40 €.',
              '**Baldes de poupança** (760 €): Fundo de emergência 300 €, Férias 150 € (objetivo de 1 800 € até julho), Carro 160 €, Geral 150 €.',
              '**Investimento** (100 €): débito automático para um PPR.',
              'Somando tudo dá 2 100 €, ou seja, a alocação está em 100%. A app mostra "Deixar na conta corrente: 1 240 €" e "Transferir agora para a poupança: 460 €" (os 760 € de poupança menos os 300 € da renda, que ainda não chegou).',
            ],
          },
        ],
      },
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
              '**Baldes de poupança**: "Fixo" é para poupança contínua e "[[objetivo|Objetivo]]" é para uma meta com valor e data.',
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
    id: 'usar',
    title: 'Usar a Contas',
    kicker: 'Guia de utilização',
    summary: 'O que fazer no dia a dia, em cada semana e no fim de cada mês.',
    blocks: [
      {
        t: 'p',
        text: 'A Contas usa-se em três ritmos. **No dia a dia** só olhas e registas o que acontece. **Uma vez por semana** dás cinco minutos para manter tudo em ordem. **No fim do mês** fechas o mês e preparas o seguinte. Cada parte abaixo diz em que ritmo se encaixa.',
      },
    ],
    subs: [
      {
        title: 'Dia a dia: ver onde está o dinheiro',
        blocks: [
          {
            t: 'p',
            text: 'O **Overview** responde a isso num olhar. Por baixo vês cada balde e a evolução ao longo do tempo. No topo estão quatro valores:',
          },
          {
            t: 'list',
            items: [
              '**Total poupado**: tudo o que juntaste, ou seja, o dinheiro na conta poupança mais o que está investido.',
              '**[[na conta do banco|Na conta do banco]]**: só a parte que deve estar na tua **conta poupança** (a soma dos baldes). Não inclui investimentos.',
              '**Investidos**: o que está nos veículos de investimento.',
              '**Taxa de poupança** do mês: a parte do rendimento que vai para poupança e investimento.',
            ],
          },
          {
            t: 'p',
            text: 'Se "Na conta do banco" for diferente do saldo da tua conta poupança, o ícone de ajuda explica porquê (por exemplo, uma renda que ainda não chegou).',
          },
          {
            t: 'example',
            text: 'A meio do mês, a Marta abre o Overview. Vê Total poupado 8 400 €, que é Na conta do banco 4 280 € mais Investidos 4 120 €. Abre a app do banco, vê que a conta poupança tem 4 280 € e o valor bate, por isso não há nada a fazer.',
          },
        ],
      },
      {
        title: 'Dia a dia: registar gastos',
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
          {
            t: 'example',
            text: 'Ao domingo, a Marta descarrega o extrato do banco em PDF e importa-o em Gastos. Vêm 54 linhas, a app sugere categoria para 51, e ela corrige as 3 restantes antes de confirmar.',
          },
        ],
      },
      {
        title: 'Dia a dia: dar categoria aos gastos',
        blocks: [
          {
            t: 'p',
            text: 'Cada gasto tem uma **[[categoria]] do plano**, que é a mesma categoria que planeaste em Planeamento. É assim que a app compara o planeado com o real. A [[subcategoria]] é opcional e serve para detalhar (ex.: Casa → Eletricidade).',
          },
          {
            t: 'p',
            text: 'Gastos sem categoria aparecem num aviso e não contam em nenhuma despesa planeada. Para muitos de uma vez, seleciona-os e usa a edição em grupo.',
          },
          {
            t: 'example',
            text: 'No extrato aparece "PINGO DOCE MATOSINHOS" com 42,30 €. A Marta escolhe a categoria Supermercado. Da vez seguinte, a app já reconhece o comerciante e sugere Supermercado sozinha.',
          },
        ],
      },
      {
        title: 'Dia a dia: gasto pago pela poupança',
        blocks: [
          {
            t: 'p',
            text: 'Quando um gasto sai da poupança (e não do orçamento do mês), escolhe como categoria um balde de poupança, por exemplo Geral. Esse gasto **não conta contra o orçamento do mês** e fica em "[[fora do plano|Fora do plano]]".',
          },
          {
            t: 'p',
            text: 'Isto não mexe no saldo do balde. Para a poupança refletir a saída, usa "Criar movimento de poupança" no gasto e confirma. A app pede confirmação em dois passos para não criares movimentos por engano.',
          },
          {
            t: 'example',
            text: 'A Marta pagou 180 € ao dentista com dinheiro da poupança. Põe como categoria o balde Geral, usa "Criar movimento de poupança" e o saldo do balde Geral desce 180 €. O orçamento de Saúde não é afetado.',
          },
        ],
      },
      {
        title: 'Dia a dia: movimentos entre baldes',
        blocks: [
          {
            t: 'p',
            text: 'Em Movimentos usas "+ Movimento" para registar depósitos, saídas e **transferências entre baldes**. O saldo de cada balde é sempre: o que foi planeado mais os movimentos.',
          },
          {
            t: 'example',
            text: 'A Marta decide mudar 100 € do balde Carro para o Fundo de emergência. Faz uma transferência em Movimentos. O Total poupado não muda, só a divisão entre os dois baldes.',
          },
        ],
      },
      {
        title: 'Semana: a rotina de cinco minutos',
        blocks: [
          { t: 'p', text: 'Uma vez por semana, no computador:' },
          {
            t: 'steps',
            items: [
              '**Importa o extrato** em Gastos desde a última vez.',
              '**Classifica** os gastos sem categoria. O aviso no topo diz quantos faltam.',
              '**Vê a secção "Atenção"** no Overview: avisa quando uma categoria está acima do ritmo do mês ou quando há gastos por classificar.',
              '**Confirma rendas que chegaram depois do salário**: em "A transferir quando chegar", usa "Já transferi" quando passares o valor para a poupança.',
              '**Compara** o valor "Na conta do banco" com o saldo da tua conta poupança. Se houver diferença, procura o gasto ou movimento em falta.',
            ],
          },
          {
            t: 'example',
            text: 'Num domingo, dia 15, a secção Atenção diz à Marta: "Supermercado: já gastaste 78% do plano, acima do ritmo do mês". Ela decide gastar menos nas compras da segunda quinzena.',
          },
        ],
      },
      {
        title: 'Fim do mês: fechar e preparar o seguinte',
        blocks: [
          { t: 'p', text: 'Perto do fim do mês financeiro, faz este fecho:' },
          {
            t: 'steps',
            items: [
              '**Revê o mês** em Analytics: o plano contra o real por categoria, e o que ficou fora do plano.',
              '**Prepara o plano seguinte** em Planeamento: ajusta rendimentos, despesas e poupanças. A alocação tem de chegar a 100% para poderes aplicar.',
              '**Aplica o plano** quando puderes. O botão só abre a partir de 3 dias antes de o mês começar.',
              '**Faz as transferências** no banco: deixa o valor de "Deixar na conta corrente" e transfere o de "Transferir agora para a poupança".',
              '**Exporta uma cópia de segurança** em Definições → Dados.',
            ],
          },
          {
            t: 'example',
            text: 'A 29 de outubro, a Marta revê o Analytics: gastou 160 € em Lazer, contra 120 € planeados. Em Planeamento sobe Lazer para 150 € em novembro e baixa o balde Geral de 150 € para 120 €, para a alocação continuar em 100%. Aplica o plano e transfere 430 € para a poupança (730 € de poupança menos os 300 € da renda).',
          },
        ],
      },
      {
        title: 'Mês: rendimentos que chegam depois do salário',
        blocks: [
          {
            t: 'p',
            text: 'Se um rendimento (por exemplo uma renda) só chega depois do salário, marca-o como "Chega depois" em "Quando chega?". Esse valor **não entra na transferência de agora**: transferes só o resto e, quando ele chegar, passas-o para a poupança.',
          },
          {
            t: 'p',
            text: 'Conta sempre para o total de rendimento e para a alocação de 100%. O dia previsto é só um lembrete.',
          },
          {
            t: 'example',
            text: 'A renda do quarto (300 €) chegou no dia 8. A Marta passa os 300 € para a poupança no banco e toca em "Já transferi", em "A transferir quando chegar". O cartão fica marcado como "Transferido".',
          },
        ],
      },
      {
        title: 'Mês: o mês financeiro',
        blocks: [
          {
            t: 'p',
            text: 'Por defeito o mês começa no dia 1. Se recebes o salário a meio ou no fim do mês, podes começar o [[mês financeiro]] nessa data. Define o padrão em Definições → Início do mês financeiro.',
          },
          {
            t: 'p',
            text: 'Os dias possíveis vão do dia 20 do mês anterior até ao dia 5. Para mudar só um mês, abre esse mês em Planeamento e usa "alterar" ao lado das datas (no computador).',
          },
          {
            t: 'example',
            text: 'A Marta passou a receber o salário a 25. Definiu o início do mês financeiro para o dia 25. Agora o mês de dezembro vai de 25 de novembro a 24 de dezembro, e o plano segue essas datas.',
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
          {
            t: 'example',
            text: 'Em janeiro, a Marta vê o aviso de que Lazer está acima do plano há 3 meses seguidos. Em vez de se esforçar mais, decide que 150 € é o valor real e atualiza o plano. Marca Lazer com a estrela para o gráfico abrir sempre nessa categoria.',
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
          {
            t: 'example',
            text: 'A Marta quer ir a Itália em julho e cria o objetivo "Itália, 1 800 € até julho". Acrescenta também o seguro anual do carro, 480 € em março, com "+ Movimento". A projeção mostra que o balde Carro fica negativo em março, por isso ela aumenta a entrada mensal nesse balde.',
          },
        ],
      },
      {
        title: 'Investimento',
        blocks: [
          {
            t: 'p',
            text: 'Um [[veículo]] é onde está investido o dinheiro (por exemplo uma corretora ou um PPR). Dentro dele podes ter vários **ativos**.',
          },
          {
            t: 'list',
            items: [
              '**[[checkpoint|Checkpoint]]**: regista o valor atual de um veículo ou ativo numa data. O ganho e a taxa anualizada calculam-se a partir dos checkpoints. Atualiza-os de vez em quando: a app avisa quando o último tem mais de seis meses.',
              '**Distribuir**: reparte o "[[saldo livre]]" do veículo (dinheiro ainda não atribuído a nenhum ativo) pelos ativos.',
              '**Movimento direto**: depósitos e resgates que entram ou saem do veículo.',
              '**Projeção por ativo**: indica a taxa anual esperada, a entrada mensal e o aumento anual para ver onde podes chegar.',
            ],
          },
          {
            t: 'example',
            text: 'O PPR da Marta é um veículo. No último dia de cada mês, ela abre a app do banco, vê que o PPR vale 4 120 € e regista um checkpoint com esse valor. A Contas calcula o ganho desde o início e a taxa anual.',
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
          {
            t: 'example',
            text: 'A Marta importou sem querer o mesmo extrato duas vezes. Antes de confirmar, a app avisou que várias linhas pareciam repetidas, e ela desmarcou-as.',
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
          {
            t: 'example',
            text: 'A Marta vendeu o carro. Pôs o balde Carro a 0 no mês atual e nos seguintes e arquivou-o. O balde deixou de aparecer nas listas, mas o histórico de quando o tinha continua nos gráficos.',
          },
        ],
      },
    ],
  },
]

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Porque é que não consigo aplicar o plano?',
    a: 'Há duas razões possíveis. A [[alocação]] tem de estar em 100%, sem diferença. E só podes aplicar o plano a partir de 3 dias antes de o mês financeiro começar, e depois de aplicares os meses anteriores.',
  },
  {
    q: 'O valor "Na conta do banco" não bate com o saldo da minha conta poupança.',
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

// `id` é a chave usada nas marcações [[...]] do conteúdo.
export const GLOSSARY: { id: string; term: string; def: string }[] = [
  {
    id: 'alocação',
    term: 'Alocação',
    def: 'A distribuição do rendimento do mês por despesas, poupanças e investimentos. Tem de chegar a 100% para poderes aplicar o plano.',
  },
  {
    id: 'aplicar plano',
    term: 'Aplicar plano',
    def: 'Confirmar o plano do mês. A partir daí os saldos dos baldes contam o que planeaste.',
  },
  {
    id: 'balde',
    term: 'Balde',
    def: 'Uma divisão virtual do dinheiro que tens numa conta poupança geral. Por exemplo, com 10 000 € na poupança podes ter 6 000 € no balde Emergência, 2 000 € em Férias e 2 000 € em Carro. O dinheiro está todo na mesma conta do banco, e a Contas sabe quanto pertence a cada balde.',
  },
  {
    id: 'categoria',
    term: 'Categoria',
    def: 'Um grupo de despesas do teu orçamento, como Casa, Carro ou Lazer. Cada gasto pertence a uma categoria.',
  },
  {
    id: 'chega depois',
    term: 'Chega depois',
    def: 'Rendimento que entra depois do salário. Não conta para a transferência de agora, mas conta para os 100% da alocação.',
  },
  {
    id: 'checkpoint',
    term: 'Checkpoint',
    def: 'O valor de um investimento numa data. Serve para calcular o ganho e a taxa anualizada.',
  },
  {
    id: 'débito automático',
    term: 'Débito automático',
    def: 'Dinheiro que sai da conta direto para um veículo de investimento, sem passar pelos baldes.',
  },
  {
    id: 'fora do plano',
    term: 'Fora do plano',
    def: 'Gastos que não contam contra o orçamento do mês: pagos pela poupança ou sem categoria.',
  },
  {
    id: 'mês financeiro',
    term: 'Mês financeiro',
    def: 'O período que a app trata como "um mês". Por defeito é o mês do calendário, mas pode começar noutro dia (por exemplo no dia em que recebes o salário).',
  },
  {
    id: 'na conta do banco',
    term: 'Na conta do banco',
    def: 'No Overview, a soma dos baldes de poupança: o valor que deve estar na tua conta poupança do banco, sem contar com os investimentos.',
  },
  {
    id: 'objetivo',
    term: 'Objetivo',
    def: 'Um balde com valor e data (por exemplo, um carro novo). A app diz quanto poupar por mês para o atingires.',
  },
  {
    id: 'plano',
    term: 'Plano',
    def: 'A decisão do mês sobre para onde vai o dinheiro: despesas, cada balde de poupança e investimentos.',
  },
  {
    id: 'saldo livre',
    term: 'Saldo livre',
    def: 'Dinheiro de um veículo de investimento que ainda não está atribuído a nenhum ativo.',
  },
  {
    id: 'subcategoria',
    term: 'Subcategoria',
    def: 'Um detalhe de uma categoria. Por exemplo, em Casa podes ter Eletricidade, Água e Gás.',
  },
  {
    id: 'veículo',
    term: 'Veículo',
    def: 'Onde está investido o dinheiro (corretora, PPR, certificados). Contém um ou mais ativos.',
  },
]
