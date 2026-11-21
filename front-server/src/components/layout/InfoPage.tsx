import type {ReactNode} from 'react'
import {Breadcrumbs, Notice} from '../gov'

export function InfoPage({title, intro, children}: { title: string; intro: string; children: ReactNode }) {
    return <div className="container info-page"><Breadcrumbs ancestors={[{href: '/', label: 'Strona główna'}]}
                                                             current={title}/>
        <div className="info-content">
            <div className="eyebrow">INFORMACJE O SERWISIE</div>
            <h1>{title}</h1><p className="info-intro">{intro}</p><Notice>To treść przykładowa. Przed publikacją
            uzupełnij ją o informacje właściwe dla administratora i działania serwisu.</Notice>
            <div className="prose">{children}</div>
        </div>
    </div>
}
