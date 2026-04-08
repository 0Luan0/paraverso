/**
 * mesUtils.js — Funções e constantes compartilhadas da aba Mês.
 * Fonte única de verdade — importar daqui, nunca duplicar.
 */

export const NOMES_MES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]

// Lowercase month names used for daily note titles (e.g., "6 abril 2026")
export const MESES_PT_LOWER = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro'
]

// Full weekday names (Sunday = index 0)
export const DIAS_SEMANA = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

export function mesId(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}`
}

/** Daily note title: "6 abril 2026" — matches criarNotaDiaria() format. */
export function dailyNoteTitle(ano, mes, dia) {
  return `${dia} ${MESES_PT_LOWER[mes - 1]} ${ano}`
}

/** Month subfolder name: "2026-04" */
export function monthFolderName(ano, mes) {
  return mesId(ano, mes)
}

/** Month config note title: "Abril 2026" */
export function monthConfigTitle(ano, mes) {
  return `${NOMES_MES[mes - 1]} ${ano}`
}

/** Resumo note title: "Resumo Abril 2026" */
export function resumoNoteTitle(ano, mes) {
  return `Resumo ${NOMES_MES[mes - 1]} ${ano}`
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
    habitos: ['Exercício', 'Leitura', 'Foco', 'Saúde'],
    dias,
    metas: [],
    resumo: '',
  }
}
