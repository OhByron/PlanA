import { Outlet } from '@tanstack/react-router';
import { RequireAuth } from '../auth/require-auth';
import { Sidebar } from '../components/sidebar';
import { TopBar } from '../components/top-bar';

export function AuthenticatedLayout() {
  return (
    <RequireAuth>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </RequireAuth>
  );
}
