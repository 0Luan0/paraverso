import { useState, useEffect, useRef } from 'react'
import {
  db, getCadernos, criarCaderno, criarNotaVazia,
  salvarNota, deletarNota, getNotasPorCaderno
} from '../../db/index'
import { NotesSidebar } from './NotesSidebar'
import { NoteEditor } from './NoteEditor'

async function deletarCadernoDB(id, nome) {
  const notas = await getNotasPorCaderno(nome)
  for (const n of notas) await deletarNota(n.id)
  await db.cadernos.delete(id)
}

export function NotasTab({ textura = 'none' }) {
  const [cadernos, setCadernos] = useState([])
  const [cadernoAtivo, setCadernoAtivo] = useState('Pensamentos')
  const [notas, setNotas] = useState([])
  const [notaAtiva, setNotaAtiva] = useState(null)
  const saveTimer = useRef(null)

  useEffect(() => {
    getCadernos().then(lista => {
      setCadernos(lista)
      if (lista.length > 0) setCadernoAtivo(lista[0].nome)
    })
  }, [])

  useEffect(() => {
    if (!cadernoAtivo) return
    getNotasPorCaderno(cadernoAtivo).then(lista => {
      setNotas(lista)
      if (lista.length > 0 && !notaAtiva) setNotaAtiva(lista[0])
      else if (lista.length === 0) setNotaAtiva(null)
    })
  }, [cadernoAtivo])

  async function novaNota(tituloInicial) {
    const nota = criarNotaVazia(cadernoAtivo)
    if (tituloInicial) nota.titulo = tituloInicial
    await salvarNota(nota)
    const lista = await getNotasPorCaderno(cadernoAtivo)
    setNotas(lista)
    setNotaAtiva(nota)
    return nota
  }

  async function novoCaderno(nome) {
    await criarCaderno(nome)
    const lista = await getCadernos()
    setCadernos(lista)
    setCadernoAtivo(nome)
    setNotaAtiva(null)
  }

  async function deletarCaderno(id, nome) {
    if (!confirm(`Remover o caderno "${nome}" e todas as suas notas?`)) return
    await deletarCadernoDB(id, nome)
    const lista = await getCadernos()
    setCadernos(lista)
    if (lista.length > 0) {
      setCadernoAtivo(lista[0].nome)
    } else {
      setCadernoAtivo('')
      setNotaAtiva(null)
    }
  }

  async function deletar(id) {
    await deletarNota(id)
    const lista = await getNotasPorCaderno(cadernoAtivo)
    setNotas(lista)
    if (notaAtiva?.id === id) {
      setNotaAtiva(lista.length > 0 ? lista[0] : null)
    }
  }

  function atualizarNotaAtiva(campos) {
    if (!notaAtiva) return
    const atualizada = { ...notaAtiva, ...campos }
    setNotaAtiva(atualizada)
    setNotas(prev => prev.map(n => n.id === atualizada.id ? atualizada : n))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => salvarNota(atualizada), 700)
  }

  function trocarNota(nota) {
    if (notaAtiva && saveTimer.current) {
      clearTimeout(saveTimer.current)
      salvarNota(notaAtiva)
    }
    setNotaAtiva(nota)
  }

  // Clique em [[wikilink]] — abre nota existente ou cria nova
  async function handleWikiLinkClick(titulo) {
    // salvar nota atual
    if (notaAtiva && saveTimer.current) {
      clearTimeout(saveTimer.current)
      await salvarNota(notaAtiva)
    }

    // busca em TODOS os cadernos
    const todasNotas = await db.notas.toArray()
    const encontrada = todasNotas.find(
      n => n.titulo.toLowerCase() === titulo.toLowerCase()
    )

    if (encontrada) {
      // se está em outro caderno, muda o caderno ativo primeiro
      if (encontrada.caderno !== cadernoAtivo) {
        setCadernoAtivo(encontrada.caderno)
        const lista = await getNotasPorCaderno(encontrada.caderno)
        setNotas(lista)
      }
      setNotaAtiva(encontrada)
    } else {
      // cria nova nota com esse título no caderno ativo
      await novaNota(titulo)
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-bg dark:bg-bg-dark">
      <NotesSidebar
        cadernos={cadernos}
        notas={notas}
        caderno={cadernoAtivo}
        setCaderno={(c) => { setCadernoAtivo(c); setNotaAtiva(null) }}
        notaSelecionada={notaAtiva}
        setNotaSelecionada={trocarNota}
        onNovaNota={() => novaNota()}
        onNovoCaderno={novoCaderno}
        onDeletarCaderno={deletarCaderno}
        onDeletarNota={deletar}
      />

      <div className="flex-1 flex flex-col overflow-hidden bg-surface dark:bg-surface-dark">
        {notaAtiva ? (
          <NoteEditor
            nota={notaAtiva}
            textura={textura}
            onTituloChange={titulo => atualizarNotaAtiva({ titulo })}
            onConteudoChange={conteudo => atualizarNotaAtiva({ conteudo })}
            onWikiLinkClick={handleWikiLinkClick}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <p className="text-ink-3 dark:text-ink-dark3 text-sm">Nenhuma nota selecionada</p>
            <button
              onClick={() => novaNota()}
              className="text-sm text-accent dark:text-accent-dark border border-accent/30 dark:border-accent-dark/30 rounded-lg px-4 py-2 hover:bg-accent/5 dark:hover:bg-accent-dark/5 transition-colors"
            >
              + Nova nota
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
