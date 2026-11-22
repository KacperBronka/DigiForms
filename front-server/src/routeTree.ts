import { Route as rootRoute } from './routes/__root'
import { Route as route0 } from './routes/index'
import { Route as route1 } from './routes/cookies'
import { Route as route2 } from './routes/dostepnosc'
import { Route as route3 } from './routes/edit'
import { Route as route4 } from './routes/kontakt'
import { Route as route5 } from './routes/polityka-prywatnosci'
import { Route as route6 } from './routes/view'

export const routeTree = rootRoute.addChildren([route0, route1, route2, route3, route4, route5, route6])
