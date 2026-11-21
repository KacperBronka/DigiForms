import {HeadContent, Scripts, createRootRoute} from '@tanstack/react-router'
import {SiteLayout} from '../components/layout/SiteLayout'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
    head: () => ({
        meta: [
            {charSet: 'utf-8'},
            {name: 'viewport', content: 'width=device-width, initial-scale=1'},
            {title: 'Kreator dokumentów'},
            {name: 'description', content: 'Przygotuj dokumenty online krok po kroku.'},
        ],
        links: [{rel: 'stylesheet', href: appCss}],
    }),
    shellComponent: RootDocument,
})

function RootDocument({children}: { children: React.ReactNode }) {
    return <html lang="pl">
    <head><HeadContent/></head>
    <body><SiteLayout>{children}</SiteLayout><Scripts/></body>
    </html>
}
