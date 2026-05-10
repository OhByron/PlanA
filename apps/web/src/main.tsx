import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createRoute,
  Navigate,
  Outlet,
  lazyRouteComponent,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/auth-context';
import './i18n';
import { AuthenticatedLayout } from './layouts/authenticated-layout';
import { ProjectLayout } from './layouts/project-layout';
// Auth/entry routes stay eager — they're on the critical path and small.
import { LoginPage } from './pages/login';
import { AuthCallbackPage } from './pages/auth-callback';
import { AuthErrorPage } from './pages/auth-error';
import { MyWorkPage } from './pages/my-work';
import { RealtimeProvider } from './hooks/use-realtime';
import './index.css';

// ---------------------------------------------------------------------------
// Lazy page components — split out of the main bundle.
// Each importer returns the page module; the second arg names the export.
// ---------------------------------------------------------------------------
const InvitePage = lazyRouteComponent(() => import('./pages/invite'), 'InvitePage');
const ShareDashboardPage = lazyRouteComponent(
  () => import('./pages/share-dashboard'),
  'ShareDashboardPage',
);
const OrgsPage = lazyRouteComponent(() => import('./pages/orgs'), 'OrgsPage');
const OrgDetailPage = lazyRouteComponent(() => import('./pages/org-detail'), 'OrgDetailPage');
const PortfolioDashboardPage = lazyRouteComponent(
  () => import('./pages/portfolio-dashboard'),
  'PortfolioDashboardPage',
);
const OrgWorkflowPage = lazyRouteComponent(
  () => import('./pages/org-workflow'),
  'OrgWorkflowPage',
);
const OrgTransitionHooksPage = lazyRouteComponent(
  () => import('./pages/org-transition-hooks'),
  'OrgTransitionHooksPage',
);
const ArchivePage = lazyRouteComponent(() => import('./pages/archive'), 'ArchivePage');
const BoardPage = lazyRouteComponent(() => import('./pages/project/board'), 'BoardPage');
const BacklogPage = lazyRouteComponent(() => import('./pages/project/backlog'), 'BacklogPage');
const EpicsPage = lazyRouteComponent(() => import('./pages/project/epics'), 'EpicsPage');
const EpicDetailPage = lazyRouteComponent(
  () => import('./pages/project/epic-detail'),
  'EpicDetailPage',
);
const ReportsPage = lazyRouteComponent(() => import('./pages/project/reports'), 'ReportsPage');
const TeamPage = lazyRouteComponent(() => import('./pages/project/team'), 'TeamPage');
const SprintsPage = lazyRouteComponent(() => import('./pages/project/sprints'), 'SprintsPage');
const SprintDetailPage = lazyRouteComponent(
  () => import('./pages/project/sprint-detail'),
  'SprintDetailPage',
);
const AISettingsPage = lazyRouteComponent(
  () => import('./pages/project/ai-settings'),
  'AISettingsPage',
);
const ReportViewPage = lazyRouteComponent(
  () => import('./pages/project/report-view'),
  'ReportViewPage',
);
// GraphPage pulls in @xyflow/react; GanttPage and CalendarPage are heavy too.
const GraphPage = lazyRouteComponent(() => import('./pages/project/graph'), 'GraphPage');
const GanttPage = lazyRouteComponent(() => import('./pages/project/gantt'), 'GanttPage');
const CalendarPage = lazyRouteComponent(() => import('./pages/project/calendar'), 'CalendarPage');
const VCSSettingsPage = lazyRouteComponent(
  () => import('./pages/project/vcs-settings'),
  'VCSSettingsPage',
);
const SettingsPage = lazyRouteComponent(() => import('./pages/project/settings'), 'SettingsPage');
const ReleasesPage = lazyRouteComponent(
  () => import('./pages/project/releases'),
  'ReleasesPage',
);
const ReleaseDetailPage = lazyRouteComponent(
  () => import('./pages/project/release-detail'),
  'ReleaseDetailPage',
);
// WorkItemDetailPage pulls in the @tiptap suite — keep it on its own chunk.
const WorkItemDetailPage = lazyRouteComponent(
  () => import('./pages/project/work-item-detail'),
  'WorkItemDetailPage',
);

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

const aiSettingsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/ai-settings',
  component: AISettingsPage,
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
    projectRoute.addChildren([
      boardRoute,
      graphRoute,
      backlogRoute,
      epicsRoute,
      sprintsRoute,
      ganttRoute,
      calendarRoute,
      reportsRoute,
      releasesRoute,
      releaseDetailRoute,
      teamRoute,
      settingsRoute,
      vcsSettingsRoute,
      aiSettingsRoute,
      reportViewRoute,
    ]),
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
