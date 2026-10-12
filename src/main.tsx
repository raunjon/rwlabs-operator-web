import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { config } from './config'

document.title = `${config.productName} Operator`

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <p>{config.productName} Operator</p>
  </StrictMode>,
)
