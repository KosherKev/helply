import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import Home from './pages/Home'

export const render = () => renderToString(<StaticRouter location="/"><Home /></StaticRouter>)
