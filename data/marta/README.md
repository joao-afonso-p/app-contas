# Marta: dados de demonstração (9 meses)

`contas-backup-marta-9-meses.json` é um backup no formato exato da app, com a história da Marta
que o guia conta. Serve para mostrar a app a outras pessoas sem usar dados reais.

**Como usar:** Definições → Dados → Importar cópia de segurança e escolher este ficheiro.
Substitui os dados da app, por isso usa uma conta vazia ou faz antes uma cópia dos teus dados.

## A história

- Fevereiro a outubro de 2026 (9 meses), com os planos aplicados e os gastos importados.
- Rendimentos: Salário 1 800 € e Renda do quarto 300 € ("chega depois", por volta do dia 8).
- Despesas planeadas (1 240 €): Casa 650, Supermercado 280, Lazer 120, Transportes 90, Seguros 60, Saúde 40.
- Poupança (760 €): Fundo de emergência 300, Férias 150 (objetivo de 1 800 € até julho de 2027), Carro 160, Geral 150.
- Investimento: 100 € por mês em débito automático para um PPR, com um checkpoint por mês.
- Supermercado fica acima do plano em agosto (310 €), setembro (305 €) e outubro (320 €): é o aviso "acima do plano há 3 meses seguidos".
- Gastos pagos pela poupança, com movimento: pneus (380 €, Carro), escapadinha no Douro (220 €, Férias), dentista (180 €, Geral).
- Transferência de 100 € do Carro para o Fundo de emergência, em setembro.
- O plano de novembro está por aplicar, já com Supermercado a 310 € e Geral a 120 € (como no exemplo do fim do mês).

## Números no Overview (fim de outubro)

| | |
|---|---|
| Na conta do banco | 9 460 € |
| Investidos | 4 120 € |
| Total poupado | 13 580 € |
| Fundo de emergência / Férias / Carro / Geral | 5 200 / 1 430 / 1 460 / 1 370 € |
| Valor do PPR (último checkpoint) | 4 205 € |
| Plano de novembro: transferir agora | 430 € |

Se abrires a app bem depois de novembro de 2026, vais ver avisos de planos por aplicar nos meses seguintes. É esperado.

## Regenerar

`python3 scripts/build-marta-demo.py` (os valores são determinísticos).
