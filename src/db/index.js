/**
 * db/index.js — unified data layer
 *
 * When running in Electron (window.electron exists) AND a vaultPath is set,
 * all operations go to the file system via vaultFs.js.
 *
 * Otherwise falls back to Dexie (IndexedDB) for web / first-run before vault.
 */

import Dexie from 'dexie'
import * as vault from '../lib/vaultFs'

// ── Dexie (IndexedDB) fallback ────────────────────────────────────────────────

export const db = new Dexie('paraverso')

db.version(1).stores({
  meses:    'id, ano, mes',
  notas:    'id, caderno, editadaEm, *tags',
  cadernos: 'id, nome, ordem',
})

// ── Detect runtime ────────────────────────────────────────────────────────────

function isElectron() {
  return typeof window !== 'undefined' && !!window.electron
}

// vaultPath is set by VaultProvider and injected here at runtime
let _vaultPath = null
export function setVaultPath(p) { _vaultPath = p }
export function getVaultPath()  { return _vaultPath }

function useVaultFs() {
  return isElectron() && !!_vaultPath
}

// ── Shared helpers ────────────────────────────────────────────────────────────

export function mesId(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}`
}

function criarMesVazio(ano, mes) {
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

// ── MESES ─────────────────────────────────────────────────────────────────────

export async function getMes(ano, mes) {
  if (useVaultFs()) return vault.getMesVault(_vaultPath, ano, mes)

  const id = mesId(ano, mes)
  let m = await db.meses.get(id)
  if (!m) {
    m = criarMesVazio(ano, mes)
    await db.meses.put(m)
  }
  return m
}

export async function salvarMes(mesObj) {
  if (useVaultFs()) return vault.salvarMesVault(_vaultPath, mesObj)
  await db.meses.put(mesObj)
}

export async function getTodosMeses() {
  if (useVaultFs()) return vault.getTodosMesesVault(_vaultPath)
  return db.meses.toArray()
}

// ── NOTAS ─────────────────────────────────────────────────────────────────────

export async function getNota(id) {
  if (useVaultFs()) {
    // id may be a UUID — we need to find the file. Search all notes.
    const all = await vault.getTodasNotasVault(_vaultPath)
    return all.find(n => n.id === id) || null
  }
  return db.notas.get(id)
}

export async function salvarNota(nota) {
  nota.editadaEm = Date.now()
  if (useVaultFs()) return vault.salvarNotaVault(_vaultPath, nota)
  await db.notas.put(nota)
}

export async function deletarNota(id) {
  if (useVaultFs()) {
    const nota = await getNota(id)
    if (nota) await vault.deletarNotaVault(_vaultPath, nota.caderno, nota.id)
    return
  }
  await db.notas.delete(id)
}

export async function getNotasPorCaderno(caderno) {
  if (useVaultFs()) return vault.getNotasPorCadernoVault(_vaultPath, caderno)
  return db.notas.where('caderno').equals(caderno).reverse().sortBy('editadaEm')
}

export async function getTodasNotas() {
  if (useVaultFs()) return vault.getTodasNotasVault(_vaultPath)
  return db.notas.toArray()
}

/** Versão leve: só metadados, sem parsear conteúdo. Para o QuickSwitcher. */
export async function getTodasNotasMetadata() {
  if (useVaultFs()) return vault.getTodasNotasMetadataVault(_vaultPath)
  // Dexie: notas não têm corpo pesado em memória, retorna direto
  return db.notas.toArray()
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

// ── CADERNOS ──────────────────────────────────────────────────────────────────

export async function getCadernos() {
  if (useVaultFs()) return vault.getCadernosVault(_vaultPath)

  const lista = await db.cadernos.orderBy('ordem').toArray()
  if (lista.length === 0) {
    const padroes = [
      { id: crypto.randomUUID(), nome: 'Pensamentos', ordem: 0 },
      { id: crypto.randomUUID(), nome: 'Leituras',    ordem: 1 },
      { id: crypto.randomUUID(), nome: 'Projetos',    ordem: 2 },
    ]
    await db.cadernos.bulkPut(padroes)
    return padroes
  }
  return lista
}

// ── BACKLINKS ─────────────────────────────────────────────────────────────────

/** Retorna lista de notas que mencionam [[titulo]] no conteúdo. */
export async function getBacklinks(titulo) {
  if (useVaultFs()) return vault.getBacklinksVault(_vaultPath, titulo)
  // Dexie: busca simples no body (notas armazenadas como TipTap JSON não têm [[]])
  return []
}

// ── CADERNOS ──────────────────────────────────────────────────────────────────

export async function criarCaderno(nome) {
  if (useVaultFs()) return vault.criarCadernoVault(_vaultPath, nome)

  const todos = await db.cadernos.count()
  const novo = { id: crypto.randomUUID(), nome, ordem: todos }
  await db.cadernos.put(novo)
  return novo
}
