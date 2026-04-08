import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createRoute,
  Navigate,
  Outlet,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/auth-context';
import './i18n';
import { AuthenticatedLayout } from './layouts/authenticated-layout';
import { ProjectLayout } from './layouts/project-layout';
import { LoginPage } from './pages/login';
import { AuthCallbackPage } from './pages/auth-callback';
import { AuthErrorPage } from './pages/auth-error';
import { InvitePage } from './pages/invite';
import { BoardPage } from './pages/project/board';
import { WorkItemDetailPage } from './pages/project/work-item-detail';
import { BacklogPage } from './pages/project/backlog';
import { EpicsPage } from './pages/project/epics';
import { EpicDetailPage } from './pages/project/epic-detail';
import { ReportsPage } from './pages/project/reports';
import { TeamPage } from './pages/project/team';
import { SprintsPage } from './pages/project/sprints';
import { SprintDetailPage } from './pages/project/sprint-detail';
import { AISettingsPage } from './pages/project/ai-settings';
import { MyWorkPage } from './pages/my-work';
import { OrgsPage } from './pages/orgs';
import { OrgDetailPage } from './pages/org-detail';
import { ShareDashboardPage } from './pages/share-dashboard';
import { ArchivePage } from './pages/archive';
import { ReportViewPage } from './pages/project/report-view';
import { GraphPage } from './pages/project/graph';
import { GanttPage } from './pages/project/gantt';
import { CalendarPage } from './pages/project/calendar';
import { VCSSettingsPage } from './pages/project/vcs-settings';
import { SettingsPage } from './pages/project/settings';
import { OrgWorkflowPage } from './pages/org-workflow';
import { PortfolioDashboardPage } from './pages/portfolio-dashboard';
import { OrgTransitionHooksPage } from './pages/org-transition-hooks';
import { RealtimeProvider } from './hooks/use-realtime';
import { ReleasesPage } from './pages/project/releases';
import { ReleaseDetailPage } from './pages/project/release-detail';
import './index.css';

// ---------------------------------------------------------------------------
// Query client
// ---------------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ---------------------------------------------------------------------------
// Route tree
// ---------------------------------------------------------------------------
const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// --- Public routes ---

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: AuthCallbackPage,
});

const authErrorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/error',
  component: AuthErrorPage,
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite/$token',
  component: InvitePage,
});

const shareDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share/$token',
  component: ShareDashboardPage,
});

// --- Authenticated layout ---

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  component: AuthenticatedLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/',
  component: () => <Navigate to="/my-work" />,
});

const myWorkRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/my-work',
  component: MyWorkPage,
});

// --- Org routes ---

const orgsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/orgs',
  component: OrgsPage,
});

const orgDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/orgs/$orgId',
  component: OrgDetailPage,
});

const orgPortfolioRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/orgs/$orgId/portfolio',
  component: PortfolioDashboardPage,
});

const orgWorkflowRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/orgs/$orgId/workflow',
  component: OrgWorkflowPage,
});

const orgTransitionHooksRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/orgs/$orgId/hooks',
  component: OrgTransitionHooksPage,
});

const archiveRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/archive',
  component: ArchivePage,
});

// --- Project routes ---

const projectRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/p/$projectId',
  component: ProjectLayout,
});

const boardRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/board',
  component: BoardPage,
});

const backlogRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/backlog',
  component: BacklogPage,
});

const epicsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/epics',
  component: EpicsPage,
});

const epicDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/p/$projectId/epics/$epicId',
  component: EpicDetailPage,
});

const reportsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/reports',
  component: ReportsPage,
});

const teamRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/team',
  component: TeamPage,
});

const sprintsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/sprints',
  component: SprintsPage,
});

const sprintDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/p/$projectId/sprints/$sprintId',
  component: SprintDetailPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/settings',
  component: SettingsPage,
});

const reportViewRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/report',
  component: ReportViewPage,
});

const graphRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/graph',
  component: GraphPage,
});

const ganttRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/gantt',
  component: GanttPage,
});

const calendarRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/calendar',
  component: CalendarPage,
});

const releasesRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/releases',
  component: ReleasesPage,
});

const releaseDetailRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/releases/$releaseId',
  component: ReleaseDetailPage,
});

const vcsSettingsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/vcs',
  component: VCSSettingsPage,
});

const workItemDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/p/$projectId/items/$workItemId',
  component: WorkItemDetailPage,
});

// --- Build tree ---

const routeTree = rootRoute.addChildren([
  loginRoute,
  authCallbackRoute,
  authErrorRoute,
  inviteRoute,
  shareDashboardRoute,
  authenticatedRoute.addChildren([
    indexRoute,
    myWorkRoute,
    orgsRoute,
    orgDetailRoute,
    orgPortfolioRoute,
    orgWorkflowRoute,
    orgTransitionHooksRoute,
    archiveRoute,
    projectRoute.addChildren([boardRoute, graphRoute, backlogRoute, epicsRoute, sprintsRoute, ganttRoute, calendarRoute, reportsRoute, releasesRoute, releaseDetailRoute, teamRoute, settingsRoute, vcsSettingsRoute, reportViewRoute]),
    epicDetailRoute,
    sprintDetailRoute,
    workItemDetailRoute,
  ]),
]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed - app still works without it
    });
  });
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeProvider>
          <RouterProvider router={router} />
        </RealtimeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
