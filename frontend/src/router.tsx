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

export const appRouter = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <PublicCataloguePage /> },
      { path: '/exhibitions', element: <CuratorExhibitionsPage /> },
      {
        path: '/exhibitions/new',
        element: <NewExhibitionPage />,
      },
      {
        path: '/exhibitions/:id/edit',
        element: <EditExhibitionPage />,
      },
      {
        path: '/exhibitions/:id/artworks',
        element: <ArtworkSearchPage />,
      },
      {
        path: '/exhibitions/:id/preview',
        element: <ExhibitionPreviewPage />,
      },
      {
        path: '/visit/:id',
        element: <PublicExhibitionPage />,
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
