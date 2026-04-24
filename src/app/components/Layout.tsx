import { Outlet, useNavigate, useLocation } from 'react-router';
import { Button } from './ui/button';
import { Stethoscope, LayoutDashboard, Library, LogOut, Settings, Bot } from 'lucide-react';
import { useAuth } from '../lib/auth';

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    { label: 'Workspace', icon: LayoutDashboard, path: '/' },
    { label: 'Library', icon: Library, path: '/library' },
    { label: 'Agent', icon: Bot, path: '/agent' },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-emerald-50/20">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div 
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => navigate('/')}
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-600 flex items-center justify-center">
                <Stethoscope className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  MedExtract AI
                </h1>
                <p className="text-xs text-slate-600 hidden sm:block">
                  Clinical Document Intelligence
                </p>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-2">
              {navItems.map((item) => (
                <Button
                  key={item.path}
                  variant={isActive(item.path) ? 'default' : 'ghost'}
                  onClick={() => navigate(item.path)}
                  className={
                    isActive(item.path)
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : ''
                  }
                >
                  <item.icon className="w-4 h-4 mr-2" />
                  {item.label}
                </Button>
              ))}
            </nav>

            <Button variant="outline" size="icon" className="hidden sm:flex">
              <Settings className="w-4 h-4" />
            </Button>
            <div className="hidden lg:flex items-center gap-3 ml-3">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">{user?.name}</p>
                <p className="text-xs text-slate-500">{user?.email}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void logout()}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <div className="md:hidden border-b border-slate-200 bg-white sticky top-16 z-40">
        <div className="container mx-auto px-4">
          <nav className="flex items-center gap-2 py-2 overflow-x-auto">
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant={isActive(item.path) ? 'default' : 'ghost'}
                size="sm"
                onClick={() => navigate(item.path)}
                className={
                  isActive(item.path)
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : ''
                }
              >
                <item.icon className="w-4 h-4 mr-2" />
                {item.label}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white/50 backdrop-blur-sm mt-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-600">
            <p>© 2026 MedExtract AI. For demonstration purposes only.</p>
            <p className="text-xs text-center sm:text-right">
              This is a demo interface. Not for use with real patient data or PHI.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
