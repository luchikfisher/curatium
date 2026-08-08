import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { CuratorExhibitionsPage } from './pages/CuratorExhibitionsPage'
import { ArtworkSearchPage } from './pages/ArtworkSearchPage'
import { EditExhibitionPage } from './pages/EditExhibitionPage'
import { ExhibitionPreviewPage } from './pages/ExhibitionPreviewPage'
import { NewExhibitionPage } from './pages/NewExhibitionPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PublicCataloguePage } from './pages/PublicCataloguePage'
import { PublicExhibitionPage } from './pages/PublicExhibitionPage'
import { routeOrientationMetadata } from './features/route-orientation/routeOrientation'

export const appRouter = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      {
        path: '/',
        element: <PublicCataloguePage />,
        handle: { orientation: routeOrientationMetadata.catalogue },
      },
      {
        path: '/exhibitions',
        element: <CuratorExhibitionsPage />,
        handle: { orientation: routeOrientationMetadata.curatorList },
      },
      {
        path: '/exhibitions/new',
        element: <NewExhibitionPage />,
        handle: { orientation: routeOrientationMetadata.newExhibition },
      },
      {
        path: '/exhibitions/:id/edit',
        element: <EditExhibitionPage />,
        handle: { orientation: routeOrientationMetadata.metadata },
      },
      {
        path: '/exhibitions/:id/artworks',
        element: <ArtworkSearchPage />,
        handle: { orientation: routeOrientationMetadata.artworks },
      },
      {
        path: '/exhibitions/:id/preview',
        element: <ExhibitionPreviewPage />,
        handle: { orientation: routeOrientationMetadata.preview },
      },
      {
        path: '/visit/:id',
        element: <PublicExhibitionPage />,
        handle: { orientation: routeOrientationMetadata.publicExhibition },
      },
      {
        path: '*',
        element: <NotFoundPage />,
        handle: { orientation: routeOrientationMetadata.notFound },
      },
    ],
  },
])
