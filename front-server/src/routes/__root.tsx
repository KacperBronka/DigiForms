import { Outlet, createRootRoute } from '@tanstack/react-router'
import { SiteLayout } from '../components/layout/SiteLayout'

export const Route = createRootRoute({
  component: () => <SiteLayout><Outlet /></SiteLayout>,
  notFoundComponent: () => <div className="container info-page"><h1>Nie znaleziono strony</h1><a href="/">Wróć do kreatora dokumentów</a></div>,
})
