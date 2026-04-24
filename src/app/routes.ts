import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Dashboard } from './pages/Dashboard';
import { Library } from './pages/Library';
import { DocumentDetail } from './pages/DocumentDetail';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Agent } from './pages/Agent';

export const router = createBrowserRouter([
  {
    path: '/login',
    Component: Login,
  },
  {
    path: '/signup',
    Component: Signup,
  },
  {
    Component: ProtectedRoute,
    children: [
      {
        path: '/',
        Component: Layout,
        children: [
          {
            index: true,
            Component: Dashboard,
          },
          {
            path: 'library',
            Component: Library,
          },
          {
            path: 'agent',
            Component: Agent,
          },
          {
            path: 'document/:id',
            Component: DocumentDetail,
          },
        ],
      },
    ],
  },
]);
