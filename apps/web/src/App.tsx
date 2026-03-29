export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-brand-700">PlanA</span>
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100">
            pre-alpha
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Agile, actually.</h1>
          <p className="text-lg text-gray-500 mb-8">
            Phase 0 scaffold is running. Time to build.
          </p>
          <div className="inline-flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-full px-4 py-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Monorepo online
          </div>
        </div>
      </main>
    </div>
  );
}
