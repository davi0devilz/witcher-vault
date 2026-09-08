import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { applyFontSize, FONT_SIZE_META_KEY, isFontSizeOption } from './lib/fontSize'
import { applyTheme, isThemeOption, THEME_META_KEY } from './lib/theme'
import Favorites from './pages/Favorites'
import GameDetail from './pages/GameDetail'
import Home from './pages/Home'
import Library from './pages/Library'
import Settings from './pages/Settings'
import SteamExplorer from './pages/SteamExplorer'
import WhatToPlay from './pages/WhatToPlay'

export default function App(): JSX.Element {
  useEffect(() => {
    window.api.db.getMeta(FONT_SIZE_META_KEY).then((value) => {
      applyFontSize(isFontSizeOption(value) ? value : 'medium')
    })
    window.api.db.getMeta(THEME_META_KEY).then((value) => {
      applyTheme(isThemeOption(value) ? value : 'oled')
    })
  }, [])

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="library" element={<Library />} />
        <Route path="favorites" element={<Favorites />} />
        <Route path="game/:id" element={<GameDetail />} />
        <Route path="steam-explorer" element={<SteamExplorer />} />
        <Route path="what-to-play" element={<WhatToPlay />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
