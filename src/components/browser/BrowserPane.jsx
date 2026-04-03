import { useRef, useState, useEffect, useCallback } from 'react'

const el = () => window.electron

const btnStyle = {
  background: 'none',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  fontSize: '14px',
  padding: '2px 6px',
  borderRadius: 4,
  lineHeight: 1,
}

export default function BrowserPane({ vaultPath, onClose }) {
  const webviewRef = useRef(null)
  const [url, setUrl] = useState('https://www.google.com')
  const [urlInput, setUrlInput] = useState('https://www.google.com')
  const [loading, setLoading] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  // Handle "Resumir com IA" from context menu
  const handleSummarize = useCallback(async ({ selectedText, url: pageUrl }) => {
    try {
      const scraped = await el().browser.scrapeUrl(pageUrl)

      // Build context paths
      const machinePath = await el().joinPath(vaultPath, '_machine')
      const contextsPath = await el().joinPath(machinePath, 'contexts')
      const templatesPath = await el().joinPath(machinePath, 'templates')

      let pessoa = '', interesses = '', template = ''
      try { pessoa = await el().machineContext.readContext(await el().joinPath(contextsPath, 'pessoa.md')) } catch {}
      try { interesses = await el().machineContext.readContext(await el().joinPath(contextsPath, 'interesses.md')) } catch {}
      try { template = await el().machineContext.readContext(await el().joinPath(templatesPath, 'pesquise.md')) } catch {}

      const slug = pageUrl.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40)

      const prompt = [
        '[CONTEXTO DA PESSOA]',
        pessoa || '[ainda vazio]',
        '',
        '[INTERESSES E REFERÊNCIAS]',
        interesses || '[ainda vazio]',
        '',
        '[TEMPLATE DE COMPORTAMENTO]',
        template || '[template padrão]',
        '',
        '[CONTEÚDO DA PÁGINA]',
        `URL: ${pageUrl}`,
        `Trecho selecionado: ${selectedText}`,
        `Conteúdo: ${(scraped.content || '').slice(0, 3000)}`,
        '',
        '[TAREFA]',
        `Resuma esta página conectando com os interesses da pessoa. Salve o resultado como _machine/contexts/${slug}.md`,
      ].join('\\n')

      el().terminal.write(prompt + '\r')
    } catch (err) {
      console.error('[Browser] erro ao resumir:', err)
    }
  }, [vaultPath])

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onDidNavigate = (e) => {
      setUrl(e.url)
      setUrlInput(e.url)
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
    }

    const onStartLoad = () => setLoading(true)
    const onStopLoad = () => {
      setLoading(false)
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
    }

    const onDomReady = () => {
      el().browser.webviewReady(wv.getWebContentsId())
    }

    wv.addEventListener('did-navigate', onDidNavigate)
    wv.addEventListener('did-navigate-in-page', onDidNavigate)
    wv.addEventListener('did-start-loading', onStartLoad)
    wv.addEventListener('did-stop-loading', onStopLoad)
    wv.addEventListener('dom-ready', onDomReady)

    el().browser.onSummarize(handleSummarize)

    return () => {
      wv.removeEventListener('did-navigate', onDidNavigate)
      wv.removeEventListener('did-navigate-in-page', onDidNavigate)
      wv.removeEventListener('did-start-loading', onStartLoad)
      wv.removeEventListener('did-stop-loading', onStopLoad)
      wv.removeEventListener('dom-ready', onDomReady)
      el().browser.offSummarize()
    }
  }, [handleSummarize])

  const navigate = (target) => {
    let finalUrl = target.trim()
    if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl
    setUrl(finalUrl)
    setUrlInput(finalUrl)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#1a1a1a' }}>
      {/* Navigation bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderBottom: '1px solid #333',
        flexShrink: 0,
        background: '#1e1e1e',
      }}>
        <button
          onClick={() => webviewRef.current?.goBack()}
          disabled={!canGoBack}
          style={{ ...btnStyle, opacity: canGoBack ? 1 : 0.3 }}
          title="Voltar"
        >
          &#8592;
        </button>
        <button
          onClick={() => webviewRef.current?.goForward()}
          disabled={!canGoForward}
          style={{ ...btnStyle, opacity: canGoForward ? 1 : 0.3 }}
          title="Avançar"
        >
          &#8594;
        </button>
        <button
          onClick={() => loading ? webviewRef.current?.stop() : webviewRef.current?.reload()}
          style={btnStyle}
          title={loading ? 'Parar' : 'Recarregar'}
        >
          {loading ? '✕' : '↺'}
        </button>

        <input
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && navigate(urlInput)}
          style={{
            flex: 1,
            fontSize: 12,
            fontFamily: 'Menlo, Monaco, monospace',
            background: '#2a2a2a',
            border: '1px solid #3a3a3a',
            borderRadius: 6,
            color: '#ccc',
            padding: '4px 8px',
            outline: 'none',
          }}
          placeholder="https://..."
        />

        <button
          onClick={onClose}
          style={{ ...btnStyle, marginLeft: 4 }}
          title="Fechar browser"
        >
          ✕
        </button>
      </div>

      {/* Loading bar */}
      {loading && (
        <div style={{ height: 2, background: '#4d9ef7', animation: 'pulse 1s infinite', flexShrink: 0 }} />
      )}

      {/* Webview — same pattern as Obsidian Surfing */}
      <webview
        ref={webviewRef}
        src={url}
        style={{ flex: 1, width: '100%', border: 'none' }}
        allowpopups="true"
      />
    </div>
  )
}
