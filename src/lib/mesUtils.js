/**
 * mesUtils.js — Funções e constantes compartilhadas da aba Mês.
 * Fonte única de verdade — importar daqui, nunca duplicar.
 */

export const NOMES_MES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]

export function mesId(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}`
}

export function criarMesVazio(ano, mes) {
  const diasNoMes = new Date(ano, mes, 0).getDate()
  const nomesDias = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

  const dias = Array.from({ length: diasNoMes }, (_, i) => {
    const n = i + 1
    const data = new Date(ano, mes - 1, n)
    return { n, letraDia: nomesDias[data.getDay()], memo: '', nota: '', habitos: [] }
  })

  return {
    id: mesId(ano, mes),
    ano,
    mes,
    habitos: ['Treino', 'Leitura', 'Foco', 'Bem-estar'],
    dias,
    metas: [
      { id: crypto.randomUUID(), categoria: 'Leituras', itens: [] },
      { id: crypto.randomUUID(), categoria: 'Projetos', itens: [] },
    ],
    resumo: '',
  }
}
