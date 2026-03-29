import { UserMenu } from './user-menu';

export function TopBar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div>{/* Breadcrumbs will go here in a later increment */}</div>
      <div className="flex items-center gap-3">
        {/* Notification bell — placeholder */}
        <button
          className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Notifications"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
