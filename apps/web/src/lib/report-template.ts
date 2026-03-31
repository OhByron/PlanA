// Generates a self-contained HTML document for print/PDF export.
// Uses inline styles — no external CSS dependency.

interface ReportData {
  type: string;
  generated_at: string;
  project: { name: string; description: string | null };
  executive_summary?: string;
  metrics: {
    total_items: number;
    done_items: number;
    total_points: number;
    done_points: number;
    completion_pct: number;
  };
  velocity: Array<{ name: string; velocity: number | null }>;
  epics: Array<{
    title: string;
    total_stories: number;
    done_stories: number;
    total_ac: number;
    test_coverage_pct: number;
  }>;
  defects: { total: number; open: number; resolved: number; critical: number };
  tests: { total: number; passed: number; failed: number; errors: number; skipped: number; pass_rate: number };
  blockers: Array<{ title: string; type: string; blocked_reason: string }>;
}

function statusColor(pct: number): string {
  if (pct >= 80) return '#059669'; // green
  if (pct >= 50) return '#d97706'; // amber
  return '#dc2626'; // red
}

function progressBar(pct: number, color: string): string {
  return `
    <div style="background:#e5e7eb;border-radius:6px;height:8px;overflow:hidden;margin-top:4px;">
      <div style="background:${color};height:100%;width:${Math.min(pct, 100)}%;border-radius:6px;transition:width 0.3s;"></div>
    </div>`;
}

function metricCard(label: string, value: string, subtitle?: string, color?: string): string {
  return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;text-align:center;">
      <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
      <div style="font-size:28px;font-weight:700;color:${color || '#111827'};margin:4px 0;">${value}</div>
      ${subtitle ? `<div style="font-size:11px;color:#9ca3af;">${subtitle}</div>` : ''}
    </div>`;
}

function sectionTitle(title: string): string {
  return `<h2 style="font-size:16px;font-weight:600;color:#111827;margin:32px 0 12px;padding-bottom:8px;border-bottom:2px solid #2563eb;">${title}</h2>`;
}

export function buildReportHTML(report: ReportData): string {
  const date = new Date(report.generated_at);
  const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // Velocity chart as inline SVG
  const maxVelocity = Math.max(...(report.velocity || []).map((v) => v.velocity || 0), 1);
  const velBarWidth = report.velocity?.length ? Math.min(80, 600 / report.velocity.length) : 60;
  const velChartWidth = (report.velocity?.length || 0) * (velBarWidth + 12);

  let velocitySVG = '';
  if (report.velocity && report.velocity.length > 0) {
    const bars = report.velocity.map((v, i) => {
      const h = ((v.velocity || 0) / maxVelocity) * 120;
      const x = i * (velBarWidth + 12) + 6;
      return `
        <rect x="${x}" y="${140 - h}" width="${velBarWidth}" height="${h}" rx="4" fill="#3b82f6" />
        <text x="${x + velBarWidth / 2}" y="${135 - h}" text-anchor="middle" font-size="11" font-weight="600" fill="#374151">${v.velocity || 0}</text>
        <text x="${x + velBarWidth / 2}" y="${158}" text-anchor="middle" font-size="9" fill="#9ca3af">${v.name}</text>`;
    }).join('');
    velocitySVG = `<svg width="${velChartWidth + 12}" height="165" style="display:block;margin:0 auto;">${bars}</svg>`;
  }

  // Epic table rows
  const epicRows = (report.epics || []).map((e) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-weight:500;color:#111827;">${e.title}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;text-align:center;">
        ${e.done_stories} / ${e.total_stories}
        ${progressBar(e.total_stories > 0 ? (e.done_stories / e.total_stories) * 100 : 0, '#3b82f6')}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;text-align:center;">${e.total_ac}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;">
        <span style="color:${statusColor(e.test_coverage_pct)};font-weight:600;">${e.test_coverage_pct}%</span>
      </td>
    </tr>`).join('');

  // Blocker rows
  const blockerRows = (report.blockers || []).map((b) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #fecaca;">
        <span style="font-weight:500;color:#991b1b;">${b.title}</span>
        <span style="font-size:11px;color:#dc2626;margin-left:8px;">(${b.type})</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #fecaca;font-size:12px;color:#b91c1c;">${b.blocked_reason}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${report.project.name} — Project Report</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 18mm 24mm 18mm;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-break { page-break-before: always; }
      .no-print { display: none !important; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #111827;
      font-size: 13px;
      line-height: 1.6;
      background: #fff;
    }
    .container { max-width: 800px; margin: 0 auto; padding: 0 16px; }
    .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .metrics-grid-5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 10px 12px; text-align: left; font-size: 10px; font-weight: 600;
         color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;
         border-bottom: 2px solid #e5e7eb; background: #f9fafb; }
  </style>
</head>
<body>
  <div class="container">

    <!-- Cover / Header -->
    <div style="text-align:center;padding:48px 0 32px;border-bottom:3px solid #2563eb;">
      <div style="font-size:24px;font-weight:700;color:#2563eb;letter-spacing:-0.5px;">
        Plan<span style="color:#111827;">A</span>
      </div>
      <h1 style="font-size:32px;font-weight:700;color:#111827;margin:16px 0 4px;">
        ${report.project.name}
      </h1>
      <div style="font-size:14px;color:#6b7280;">
        ${report.type === 'project' ? 'Project Report' : 'Sprint Report'}
      </div>
      <div style="font-size:12px;color:#9ca3af;margin-top:8px;">
        ${dateStr} at ${timeStr}
      </div>
      ${report.project.description ? `<p style="font-size:13px;color:#6b7280;margin-top:16px;max-width:500px;margin-left:auto;margin-right:auto;">${report.project.description}</p>` : ''}
    </div>

    <!-- Executive Summary -->
    ${report.executive_summary ? `
    <div style="margin-top:32px;">
      ${sectionTitle('Executive Summary')}
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:20px;color:#0c4a6e;font-size:13px;line-height:1.7;">
        ${report.executive_summary.split('\n\n').map((p) => `<p style="margin-bottom:12px;">${p}</p>`).join('')}
      </div>
    </div>` : ''}

    <!-- Key Metrics -->
    ${sectionTitle('Key Metrics')}
    <div class="metrics-grid">
      ${metricCard('Completion', `${report.metrics.completion_pct}%`, `${report.metrics.done_items} of ${report.metrics.total_items} items`, statusColor(report.metrics.completion_pct))}
      ${metricCard('Points Delivered', `${report.metrics.done_points}`, `of ${report.metrics.total_points} total`)}
      ${metricCard('Test Pass Rate', `${report.tests.pass_rate}%`, `${report.tests.total} tests`, statusColor(report.tests.pass_rate))}
      ${metricCard('Open Defects', `${report.defects.open}`, `${report.defects.critical} critical`, report.defects.open > 0 ? '#dc2626' : '#059669')}
    </div>

    <!-- Overall Progress Bar -->
    <div style="margin-top:16px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#6b7280;margin-bottom:6px;">
        <span>Overall Progress</span>
        <span style="font-weight:600;color:${statusColor(report.metrics.completion_pct)};">${report.metrics.completion_pct}%</span>
      </div>
      ${progressBar(report.metrics.completion_pct, statusColor(report.metrics.completion_pct))}
    </div>

    <!-- Epic Breakdown -->
    ${report.epics && report.epics.length > 0 ? `
    <div class="page-break"></div>
    ${sectionTitle('Epic Breakdown')}
    <table>
      <thead>
        <tr>
          <th style="width:40%;">Epic</th>
          <th style="width:25%;text-align:center;">Stories</th>
          <th style="width:15%;text-align:center;">Acceptance Criteria</th>
          <th style="width:20%;text-align:center;">Test Coverage</th>
        </tr>
      </thead>
      <tbody>${epicRows}</tbody>
    </table>` : ''}

    <!-- Defects -->
    ${sectionTitle('Defects')}
    <div class="metrics-grid">
      ${metricCard('Total Found', String(report.defects.total))}
      ${metricCard('Open', String(report.defects.open), undefined, report.defects.open > 0 ? '#dc2626' : '#059669')}
      ${metricCard('Resolved', String(report.defects.resolved), undefined, '#059669')}
      ${metricCard('Critical', String(report.defects.critical), 'open & urgent', report.defects.critical > 0 ? '#dc2626' : '#059669')}
    </div>

    <!-- Test Evidence -->
    ${sectionTitle('Test Evidence')}
    <div class="metrics-grid-5">
      ${metricCard('Total', String(report.tests.total))}
      ${metricCard('Passed', String(report.tests.passed), undefined, '#059669')}
      ${metricCard('Failed', String(report.tests.failed), undefined, report.tests.failed > 0 ? '#dc2626' : '#059669')}
      ${metricCard('Errors', String(report.tests.errors), undefined, report.tests.errors > 0 ? '#dc2626' : undefined)}
      ${metricCard('Skipped', String(report.tests.skipped))}
    </div>

    <!-- Blockers -->
    ${report.blockers && report.blockers.length > 0 ? `
    ${sectionTitle('Current Blockers')}
    <table style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#fee2e2;">
          <th style="color:#991b1b;">Item</th>
          <th style="color:#991b1b;">Reason</th>
        </tr>
      </thead>
      <tbody>${blockerRows}</tbody>
    </table>` : ''}

    <!-- Velocity -->
    ${report.velocity && report.velocity.length > 0 ? `
    ${sectionTitle('Velocity History')}
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;text-align:center;">
      ${velocitySVG}
    </div>` : ''}

    <!-- Footer -->
    <div style="margin-top:48px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
      <div style="font-size:14px;font-weight:700;color:#2563eb;">Plan<span style="color:#111827;">A</span></div>
      <div style="font-size:10px;color:#9ca3af;margin-top:4px;">
        Generated ${dateStr} at ${timeStr} &middot; Confidential
      </div>
    </div>

  </div>
</body>
</html>`;
}
