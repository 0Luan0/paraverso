import { useState, useEffect, useCallback, useRef } from 'react'
import {
  db, getCadernos, criarCaderno, criarNotaVazia,
  salvarNota, deletarNota, getNotasPorCaderno
} from '../../db/index'
import { NotesSidebar } from './NotesSidebar'
import { NoteEditor } from './NoteEditor'

export function NotasTab() {
  const [cadernos, setCadernos] = useState([])
  const [cadernoAtivo, setCadernoAtivo] = useState('Pensamentos')
  const [notas, setNotas] = useState([])
  const [notaAtiva, setNotaAtiva] = useState(null)
  const saveTimer = useRef(null)

  // Carregar cadernos
  useEffect(() => {
    getCadernos().then(lista => {
      setCadernos(lista)
      if (lista.length > 0) setCadernoAtivo(lista[0].nome)
    })
  }, [])

  // Carregar notas quando muda caderno
  useEffect(() => {
    if (!cadernoAtivo) return
    getNotasPorCaderno(cadernoAtivo).then(lista => {
      setNotas(lista)
      if (lista.length > 0 && !notaAtiva) setNotaAtiva(lista[0])
      else if (lista.length === 0) setNotaAtiva(null)
    })
  }, [cadernoAtivo])

  async function novaNota() {
    const nota = criarNotaVazia(cadernoAtivo)
    await salvarNota(nota)
    const lista = await getNotasPorCaderno(cadernoAtivo)
    setNotas(lista)
    setNotaAtiva(nota)
  }

  async function novoCaderno(nome) {
    const c = await criarCaderno(nome)
    const lista = await getCadernos()
    setCadernos(lista)
    setCadernoAtivo(nome)
    setNotaAtiva(null)
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

    // debounce save
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      salvarNota(atualizada)
    }, 700)
  }

  function trocarNota(nota) {
    // salvar nota atual antes de trocar
    if (notaAtiva && saveTimer.current) {
      clearTimeout(saveTimer.current)
      salvarNota(notaAtiva)
    }
    setNotaAtiva(nota)
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
        onNovaNota={novaNota}
        onNovoCaderno={novoCaderno}
        onDeletarNota={deletar}
      />

      {/* área do editor */}
      <div className="flex-1 flex flex-col overflow-hidden bg-surface dark:bg-surface-dark">
        {notaAtiva ? (
          <NoteEditor
            nota={notaAtiva}
            onTituloChange={titulo => atualizarNotaAtiva({ titulo })}
            onConteudoChange={conteudo => atualizarNotaAtiva({ conteudo })}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <p className="text-ink-3 dark:text-ink-dark3 text-sm">Nenhuma nota selecionada</p>
            <button
              onClick={novaNota}
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
