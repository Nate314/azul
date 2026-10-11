import { useState } from 'react'
import Faq from './components/Faq'
import Game from './components/Game'
import ThemeToggle from './components/ThemeToggle'
import './App.css'

function App() {
  const [showFaq, setShowFaq] = useState(false)

  return (
    <div className="app">
      <button type="button" className="faq-button" onClick={() => setShowFaq(true)}>
        FAQ
      </button>
      <ThemeToggle />
      <h1>Azul</h1>
      <Game />
      {showFaq && <Faq onClose={() => setShowFaq(false)} />}
    </div>
  )
}

export default App
