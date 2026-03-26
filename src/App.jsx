import { useState } from 'react'
import { useTheme } from './hooks/useTheme'
import { useTexture } from './hooks/useTexture'
import { TopBar } from './components/layout/TopBar'
import { NavTabs } from './components/layout/NavTabs'
import { MesTab } from './components/mes/MesTab'
import { NotasTab } from './components/notas/NotasTab'
import { GraphTab } from './components/placeholders/GraphTab'
import { BuscaTab } from './components/placeholders/BuscaTab'

function App() {
  const { dark, toggleTheme } = useTheme()
  const { textura, cycleTextura } = useTexture()
  const [aba, setAba] = useState('mes')

  return (
    <div className="h-screen flex flex-col bg-bg dark:bg-bg-dark overflow-hidden">
      <TopBar dark={dark} toggleTheme={toggleTheme} textura={textura} cycleTextura={cycleTextura} />
      <NavTabs aba={aba} setAba={setAba} />

      <div className="flex-1 flex overflow-hidden">
        {aba === 'mes' && <MesTab />}
        {aba === 'notas' && <NotasTab textura={textura} />}
        {aba === 'graph' && <GraphTab />}
        {aba === 'busca' && <BuscaTab />}
      </div>
    </div>
  )
}

export default App
