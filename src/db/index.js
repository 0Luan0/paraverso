import Dexie from 'dexie'

export const db = new Dexie('paraverso')

db.version(1).stores({
  meses: 'id, ano, mes',         // id = 'YYYY-MM', ex: '2026-03'
  notas: 'id, caderno, editadaEm, *tags',
  cadernos: 'id, nome, ordem',
})

// ---------- helpers: MESES ----------

export async function getMes(ano, mes) {
  const id = mesId(ano, mes)
  let m = await db.meses.get(id)
  if (!m) {
    m = criarMesVazio(ano, mes)
    await db.meses.put(m)
  }
  return m
}

export async function salvarMes(mesObj) {
  await db.meses.put(mesObj)
}

export function mesId(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}`
}

function criarMesVazio(ano, mes) {
  const diasNoMes = new Date(ano, mes, 0).getDate()
  const nomesDias = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

  const dias = Array.from({ length: diasNoMes }, (_, i) => {
    const n = i + 1
    const data = new Date(ano, mes - 1, n)
    const letraDia = nomesDias[data.getDay()]
    return {
      n,
      letraDia,
      memo: '',
      nota: '',
      habitos: [],
    }
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

// ---------- helpers: NOTAS ----------

export async function getNota(id) {
  return db.notas.get(id)
}

export async function salvarNota(nota) {
  nota.editadaEm = Date.now()
  await db.notas.put(nota)
}

export async function deletarNota(id) {
  await db.notas.delete(id)
}

export async function getNotasPorCaderno(caderno) {
  return db.notas.where('caderno').equals(caderno).reverse().sortBy('editadaEm')
}

export function criarNotaVazia(caderno = 'Pensamentos') {
  return {
    id: crypto.randomUUID(),
    titulo: 'Sem título',
    caderno,
    tags: [],
    conteudo: null,
    criadaEm: Date.now(),
    editadaEm: Date.now(),
  }
}

// ---------- helpers: CADERNOS ----------

export async function getCadernos() {
  const lista = await db.cadernos.orderBy('ordem').toArray()
  if (lista.length === 0) {
    const padroes = [
      { id: crypto.randomUUID(), nome: 'Pensamentos', ordem: 0 },
      { id: crypto.randomUUID(), nome: 'Leituras', ordem: 1 },
      { id: crypto.randomUUID(), nome: 'Projetos', ordem: 2 },
    ]
    await db.cadernos.bulkPut(padroes)
    return padroes
  }
  return lista
}

export async function criarCaderno(nome) {
  const todos = await db.cadernos.count()
  const novo = { id: crypto.randomUUID(), nome, ordem: todos }
  await db.cadernos.put(novo)
  return novo
}
