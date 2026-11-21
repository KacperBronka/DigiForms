import type {ReactNode} from 'react'
import {Link, SkipLink} from '../gov'

export function SiteLayout({children}: { children: ReactNode }) {
    return <>
        <SkipLink targetId="tresc"/>
        <div className="topline">
            <div className="container topline-inner"><span className="flag" aria-hidden="true"/> Serwis informacyjny ·
                wersja demonstracyjna
            </div>
        </div>
        <header className="site-header">
            <div className="container header-inner">
                <a href="/" className="brand" aria-label="Kreator dokumentów – strona główna"><span
                    className="brand-mark"
                    aria-hidden="true"><span/></span><span>digi<b>Forms</b></span></a>
                <nav aria-label="Nawigacja główna"><a className="nav-active" href="/">Kreator dokumentów</a></nav>
            </div>
        </header>
        <main id="tresc" tabIndex={-1}>{children}</main>
        <footer className="site-footer">
            <div className="container">
                <div className="footer-main">
                    <div>
                        <div className="footer-brand">Kreator dokumentów</div>
                        <p>Prościej przygotuj dokumenty online.</p></div>
                    <nav aria-label="Informacje o serwisie"><h2>Informacje o serwisie</h2>
                        <ul>
                            <li><Link href="/polityka-prywatnosci">Polityka prywatności i RODO</Link></li>
                            <li><Link href="/dostepnosc">Deklaracja dostępności</Link></li>
                            <li><Link href="/cookies">Polityka cookies</Link></li>
                            <li><Link href="/kontakt">Kontakt</Link></li>
                        </ul>
                    </nav>
                </div>
                <div className="footer-bottom">Serwis demonstracyjny · Treści informacyjne wymagają uzupełnienia przed
                    publikacją
                </div>
            </div>
        </footer>
    </>
}
