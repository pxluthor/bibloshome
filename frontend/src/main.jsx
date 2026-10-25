import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './theme-dark.css'
import { applyTheme, getTheme } from './utils/theme'

applyTheme(getTheme()) // also syncs the mobile browser bar color (theme-color)

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
