import { Button } from '@projecta/ui';
import type { TestSummary, TestResult } from '../hooks/use-test-results';
import { TestStatusBadge } from './test-status-badge';

export interface TestResultsSectionProps {
  testSummary: TestSummary | undefined;
  sourceTestResult: TestResult | undefined;
  aiDefectLoading: boolean;
  onSuggestFromTest: () => void;
  itemType?: string;
}

export function TestResultsSection({
  testSummary,
  sourceTestResult,
  aiDefectLoading,
  onSuggestFromTest,
  itemType,
}: TestResultsSectionProps) {
  // Retest affordance: for bugs with failing tests, show a prominent banner
  const hasFailing = testSummary && (testSummary.fail > 0 || testSummary.error > 0);
  const showRetestBanner = itemType === 'bug' && sourceTestResult && hasFailing;

  return (
    <>
      {/* Retest banner for defects with failing tests */}
      {showRetestBanner && (
        <section className="mb-8">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-lg">&#x26A0;</span>
              <div>
                <p className="text-sm font-medium text-amber-800">Retest required</p>
                <p className="mt-1 text-xs text-amber-700">
                  This defect has {testSummary!.fail + testSummary!.error} failing test(s).
                  Upload new test results (JUnit XML or webhook) after the fix is deployed to
                  clear the QE gate and close this item.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Test Results */}
      {testSummary && testSummary.total > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Test Results
          </h2>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-4">
              <TestStatusBadge status={testSummary.status} total={testSummary.total} pass={testSummary.pass} />
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="text-green-600">{testSummary.pass} passed</span>
                {testSummary.fail > 0 && <span className="text-red-600">{testSummary.fail} failed</span>}
                {testSummary.error > 0 && <span className="text-red-600">{testSummary.error} errors</span>}
                {testSummary.skip > 0 && <span className="text-gray-400">{testSummary.skip} skipped</span>}
              </div>
              {testSummary.lastRun && (
                <span className="ml-auto text-xs text-gray-400">
                  Last run: {new Date(testSummary.lastRun).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Source Test Failure (for defects created from a failed test) */}
      {sourceTestResult && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Source Test Failure
          </h2>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                sourceTestResult.status === 'fail' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
              }`}>
                {sourceTestResult.status}
              </span>
              <span className="text-sm font-medium text-gray-900">{sourceTestResult.testName}</span>
            </div>
            {sourceTestResult.suiteName && (
              <p className="mb-1 text-xs text-gray-500">Suite: {sourceTestResult.suiteName}</p>
            )}
            {sourceTestResult.durationMs != null && (
              <p className="mb-2 text-xs text-gray-500">Duration: {sourceTestResult.durationMs}ms</p>
            )}
            {sourceTestResult.errorMessage && (
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100 whitespace-pre-wrap">
                {sourceTestResult.errorMessage}
              </pre>
            )}
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Source: {sourceTestResult.source} | Reported: {new Date(sourceTestResult.reportedAt).toLocaleString()}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={onSuggestFromTest}
                disabled={aiDefectLoading}
              >
                {aiDefectLoading ? 'Generating...' : 'Generate Description & ACs'}
              </Button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
