import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { CuratorExhibitionsPage } from './pages/CuratorExhibitionsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { PublicCataloguePage } from './pages/PublicCataloguePage'

export const appRouter = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <PublicCataloguePage /> },
      { path: '/exhibitions', element: <CuratorExhibitionsPage /> },
      {
        path: '/exhibitions/new',
        element: <PlaceholderPage eyebrow="Curator workspace" title="Create an exhibition" description="Exhibition details and creation will be implemented in the curator workflow phase." backTo="/exhibitions" />,
      },
      {
        path: '/exhibitions/:id/edit',
        element: <PlaceholderPage eyebrow="Curator workspace" title="Exhibition editor" description="Metadata, artwork ordering, cover selection, and publication controls will live here." backTo="/exhibitions" />,
      },
      {
        path: '/exhibitions/:id/artworks',
        element: <PlaceholderPage eyebrow="Museum collection" title="Search and select artworks" description="This route will search through the Curatium backend; the browser will never contact the museum provider directly." backTo="/exhibitions" />,
      },
      {
        path: '/exhibitions/:id/preview',
        element: <PlaceholderPage eyebrow="Draft preview" title="Preview exhibition" description="The gallery preview belongs to a later phase. Draft previews will remain separate from public visits." backTo="/exhibitions" />,
      },
      {
        path: '/visit/:id',
        element: <PlaceholderPage eyebrow="Visitor entry" title="Exhibition visit" description="The exhibition entry and tour experience will be implemented after the frontend foundation." backTo="/" />,
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
