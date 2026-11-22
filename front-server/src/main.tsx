import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router'
import './styles.css'

const element = document.getElementById('app')
if (!element) throw new Error('Missing application root')
createRoot(element).render(<StrictMode><RouterProvider router={getRouter()} /></StrictMode>)
