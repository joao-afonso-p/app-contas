# Gera data/marta/contas-backup-marta-9-meses.json: a "Marta" do guia, com 9 meses de dados
# (fev a out de 2026) no formato exato do backup da app (Definições → Dados → Importar).
# Uso: python3 scripts/build-marta-demo.py
import json, random
from datetime import date, timedelta

rnd = random.Random(2026)
OUT = 'data/marta/contas-backup-marta-9-meses.json'

MONTHS = [f'2026-{m:02d}' for m in range(2, 11)]  # fev..out

def eur(x): return round(x + 1e-9, 2)

def split(total, n):
    """Divide `total` em n partes aleatórias (cêntimos) que somam exatamente o total."""
    cents = int(round(total * 100))
    cuts = sorted(rnd.sample(range(1, cents), n - 1))
    parts = [b - a for a, b in zip([0] + cuts, cuts + [cents])]
    return [p / 100 for p in parts]

def last_day(month):
    y, m = map(int, month.split('-'))
    nxt = date(y + (m == 12), m % 12 + 1, 1)
    return (nxt - timedelta(days=1)).isoformat()

# ---------- configuração ----------
INC = {'salario': 'inc-salario', 'renda': 'inc-renda'}
EXP = {k: f'exp-{k}' for k in ['casa', 'supermercado', 'lazer', 'transportes', 'seguros', 'saude']}
BKT = {k: f'bkt-{k}' for k in ['emergencia', 'ferias', 'carro', 'geral']}
VEH = 'veh-ppr'

income_sources = [
    {'id': INC['salario'], 'name': 'Salário', 'isRent': False, 'archived': False, 'order': 0},
    {'id': INC['renda'], 'name': 'Renda do quarto', 'isRent': True, 'expectedDay': 8, 'archived': False, 'order': 1},
]
expense_categories = [
    {'id': EXP['casa'], 'name': 'Casa', 'archived': False, 'order': 0, 'fixed': True},
    {'id': EXP['supermercado'], 'name': 'Supermercado', 'archived': False, 'order': 1},
    {'id': EXP['lazer'], 'name': 'Lazer', 'archived': False, 'order': 2},
    {'id': EXP['transportes'], 'name': 'Transportes', 'archived': False, 'order': 3},
    {'id': EXP['seguros'], 'name': 'Seguros', 'archived': False, 'order': 4, 'fixed': True},
    {'id': EXP['saude'], 'name': 'Saúde', 'archived': False, 'order': 5},
]
savings_buckets = [
    {'id': BKT['emergencia'], 'name': 'Fundo de emergência', 'kind': 'fixed', 'archived': False, 'order': 0},
    {'id': BKT['ferias'], 'name': 'Férias', 'kind': 'goal', 'archived': False, 'order': 1,
     'targetAmount': 1800, 'targetDate': '2027-07', 'status': 'active'},
    {'id': BKT['carro'], 'name': 'Carro', 'kind': 'fixed', 'archived': False, 'order': 2},
    {'id': BKT['geral'], 'name': 'Geral', 'kind': 'fixed', 'archived': False, 'order': 3},
]
SUB = {k: f'sub-casa-{k}' for k in ['prestacao', 'eletricidade', 'agua', 'internet', 'condominio']}
subcategories = [
    {'id': SUB['prestacao'], 'parentId': EXP['casa'], 'name': 'Prestação da casa', 'archived': False, 'order': 0},
    {'id': SUB['eletricidade'], 'parentId': EXP['casa'], 'name': 'Eletricidade', 'archived': False, 'order': 1},
    {'id': SUB['agua'], 'parentId': EXP['casa'], 'name': 'Água', 'archived': False, 'order': 2},
    {'id': SUB['internet'], 'parentId': EXP['casa'], 'name': 'Internet', 'archived': False, 'order': 3},
    {'id': SUB['condominio'], 'parentId': EXP['casa'], 'name': 'Condomínio', 'archived': False, 'order': 4},
]
vehicles = [{'id': VEH, 'name': 'PPR', 'archived': False, 'order': 0, 'initialBalance': 3220, 'expectedRate': 3}]

# ---------- planos mensais (fev a out aplicados; novembro por aplicar) ----------
def plan(month, supermercado=280, geral=150, closed=True):
    p = {
        'id': month,
        'income': {INC['salario']: 1800, INC['renda']: 300},
        'expenses': {EXP['casa']: 650, EXP['supermercado']: supermercado, EXP['lazer']: 120,
                     EXP['transportes']: 90, EXP['seguros']: 60, EXP['saude']: 40},
        'savings': {BKT['emergencia']: 300, BKT['ferias']: 150, BKT['carro']: 160, BKT['geral']: geral},
        'autoInvestments': {VEH: 100},
        'closed': closed,
    }
    if closed:
        p['lateTransferred'] = {INC['renda']: True}
    return p

monthly_plans = [plan(m) for m in MONTHS] + [plan('2026-11', supermercado=310, geral=120, closed=False)]

# ---------- gastos ----------
transactions, savings_movements, category_rules = [], [], []
_tx = [0]

def add_tx(day_iso, amount, desc, nome, group, sub=None, bucket=False):
    _tx[0] += 1
    t = {
        'id': f'tx-{_tx[0]:04d}', 'date': day_iso, 'categoryId': '', 'amount': eur(amount),
        'description': desc, 'nome': nome, 'repoePoupanca': bucket, 'reposto': False,
        'planCategoryId': group, 'createdAt': f'{day_iso}T20:00:00.000Z',
    }
    if sub: t['subcategoryId'] = sub
    if bucket: t['fonteBucketId'] = group
    transactions.append(t)
    return t['id']

def days(month, n, lo=1, hi=28):
    return sorted(rnd.sample(range(lo, hi + 1), n))

SUPER = {'2026-02': 262.40, '2026-03': 275.10, '2026-04': 268.35, '2026-05': 284.20, '2026-06': 279.00,
         '2026-07': 276.50, '2026-08': 310.00, '2026-09': 305.00, '2026-10': 320.00}
LAZER = {'2026-02': 104.50, '2026-03': 98.00, '2026-04': 126.30, '2026-05': 111.80, '2026-06': 134.20,
         '2026-07': 118.00, '2026-08': 122.40, '2026-09': 108.90, '2026-10': 115.00}
TRANSP = {'2026-02': 91.20, '2026-03': 88.40, '2026-04': 94.60, '2026-05': 86.00, '2026-06': 92.30,
          '2026-07': 97.80, '2026-08': 90.00, '2026-09': 93.40, '2026-10': 89.60}
SAUDE = {'2026-02': 28.50, '2026-03': 41.20, '2026-04': 22.00, '2026-05': 35.60, '2026-06': 47.30,
         '2026-07': 19.90, '2026-08': 31.00, '2026-09': 38.70, '2026-10': 26.40}
ELEC = {'2026-02': 72.10, '2026-03': 65.40, '2026-04': 60.20, '2026-05': 55.80, '2026-06': 52.30,
        '2026-07': 58.90, '2026-08': 64.70, '2026-09': 70.30, '2026-10': 78.40}
STORES = [('PINGO DOCE PORTO', 'Pingo Doce'), ('CONTINENTE MATOSINHOS', 'Continente'),
          ('LIDL PORTO', 'Lidl'), ('MERCADO DO BOLHAO', 'Mercado do Bolhão')]
FUN = [('RESTAURANTE O PEIXE', 'Restaurante'), ('UCI CINEMAS NORTESHOPPING', 'Cinema'),
       ('UBER EATS', 'Uber Eats'), ('CAFE MAJESTIC', 'Café'), ('FNAC PORTO', 'Fnac')]

for m in MONTHS:
    ym = m
    # Casa
    add_tx(f'{ym}-01', 480.00, 'PREST HABITACAO BPI', 'Prestação', EXP['casa'], SUB['prestacao'])
    add_tx(f'{ym}-05', ELEC[m], 'EDP COMERCIAL DD', 'Eletricidade', EXP['casa'], SUB['eletricidade'])
    add_tx(f'{ym}-10', 24.00, 'AGUAS DO PORTO DD', 'Água', EXP['casa'], SUB['agua'])
    add_tx(f'{ym}-12', 38.00, 'MEO FIBRA DD', 'Internet', EXP['casa'], SUB['internet'])
    add_tx(f'{ym}-03', 35.00, 'CONDOMINIO RUA DO BOLHAO', 'Condomínio', EXP['casa'], SUB['condominio'])
    # Supermercado
    n = rnd.choice([5, 6, 6, 7])
    for d, amt in zip(days(m, n), split(SUPER[m], n)):
        desc, nome = rnd.choice(STORES)
        add_tx(f'{ym}-{d:02d}', amt, f'COMPRA {desc}', nome, EXP['supermercado'])
    # Lazer
    n = rnd.choice([3, 4])
    for d, amt in zip(days(m, n), split(LAZER[m], n)):
        desc, nome = rnd.choice(FUN)
        add_tx(f'{ym}-{d:02d}', amt, f'COMPRA {desc}', nome, EXP['lazer'])
    # Transportes
    add_tx(f'{ym}-02', 40.00, 'ANDANTE PASSE MENSAL', 'Andante', EXP['transportes'])
    rest = TRANSP[m] - 40.00
    a, b = split(rest, 2)
    add_tx(f'{ym}-09', a, 'GALP PORTO', 'Gasolina', EXP['transportes'])
    add_tx(f'{ym}-23', b, 'BP MATOSINHOS', 'Gasolina', EXP['transportes'])
    # Seguros
    add_tx(f'{ym}-15', 60.00, 'FIDELIDADE SEGURO AUTO', 'Seguro auto', EXP['seguros'])
    # Saúde
    n = 2 if SAUDE[m] > 30 else 1
    for d, amt in zip(days(m, n), split(SAUDE[m], n)):
        add_tx(f'{ym}-{d:02d}', amt, 'FARMACIA SANTA CATARINA', 'Farmácia', EXP['saude'])

# gastos pagos pela poupança (com o movimento correspondente)
def pay_from_savings(day_iso, amount, desc, nome, bucket_key, move_desc):
    tid = add_tx(day_iso, amount, desc, nome, BKT[bucket_key], bucket=True)
    savings_movements.append({
        'id': f'mv-{tid}', 'date': day_iso, 'bucketId': BKT[bucket_key], 'amount': -eur(amount),
        'description': move_desc, 'transactionId': tid, 'createdAt': f'{day_iso}T20:05:00.000Z',
    })

pay_from_savings('2026-03-12', 380.00, 'PNEUS ROLDAO AUTO', 'Pneus', 'carro', 'Pneus')
pay_from_savings('2026-06-21', 220.00, 'HOTEL QUINTA DO DOURO', 'Escapadinha', 'ferias', 'Escapadinha no Douro')
pay_from_savings('2026-09-17', 180.00, 'CLINICA DENTARIA PORTO', 'Dentista', 'geral', 'Dentista')

# saldos iniciais (como o onboarding cria: um movimento "Saldo inicial" no mês anterior ao 1º plano)
for key, v in [('emergencia', 2400), ('ferias', 300), ('carro', 500), ('geral', 200)]:
    savings_movements.append({
        'id': f'mv-init-{key}', 'date': '2026-01-01', 'bucketId': BKT[key], 'amount': v,
        'description': 'Saldo inicial', 'createdAt': '2026-01-01T09:00:00.000Z',
    })

# transferência entre baldes: 100 € do Carro para o Fundo de emergência
savings_movements += [
    {'id': 'mv-tr-out', 'date': '2026-09-24', 'bucketId': BKT['carro'], 'amount': -100,
     'description': 'Transferência: Carro → Fundo de emergência', 'transferGroupId': 'tg-1', 'createdAt': '2026-09-24T19:00:00.000Z'},
    {'id': 'mv-tr-in', 'date': '2026-09-24', 'bucketId': BKT['emergencia'], 'amount': 100,
     'description': 'Transferência: Carro → Fundo de emergência', 'transferGroupId': 'tg-1', 'createdAt': '2026-09-24T19:00:00.000Z'},
]

# regras aprendidas (descrição do banco → categoria)
for i, (kw, grp) in enumerate([('pingo doce', 'supermercado'), ('continente', 'supermercado'), ('lidl', 'supermercado'),
                                ('galp', 'transportes'), ('farmacia', 'saude'), ('andante', 'transportes')]):
    category_rules.append({'id': f'rule-{i}', 'keyword': kw, 'categoryId': '', 'planCategoryId': EXP[grp]})

# ---------- PPR: checkpoints mensais ----------
checkpoints = []
g = (4205 / 4120 - 1) / 9
for k in range(0, 10):
    month = f'2026-{k + 1:02d}'
    contributed = 3220 + 100 * k
    value = 4205 if k == 9 else round(contributed * (1 + g * k))
    checkpoints.append({'id': f'cp-{k:02d}', 'date': last_day(month), 'vehicleId': VEH, 'value': value,
                        **({'note': 'Início'} if k == 0 else {})})

data = {
    'incomeSources': income_sources, 'expenseCategories': expense_categories, 'savingsBuckets': savings_buckets,
    'monthlyPlans': monthly_plans, 'savingsMovements': savings_movements, 'transactions': transactions,
    'transactionCategories': [], 'subcategories': subcategories, 'categoryRules': category_rules, 'budgets': [],
    'projectionPlans': [], 'balanceOverrides': [], 'plannedMovements': [],
    'investmentVehicles': vehicles, 'investmentAssets': [], 'assetEntries': [], 'valueCheckpoints': checkpoints,
    'meta': [{'id': 'meta', 'onboardingDone': True}],
}
out = {'app': 'contas', 'version': 1, 'exportedAt': '2026-11-01T09:00:00.000Z', 'data': data}
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=2)
print('ok', len(transactions), 'gastos', len(savings_movements), 'movimentos')
