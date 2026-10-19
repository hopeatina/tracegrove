import type { BenchmarkReport } from '../protocol/index.ts';

const label = (value: string) => value.replace(/[\x00-\x1f\x7f-\x9f\u2028-\u202e\u2066-\u2069]/g,
  char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** Bounded prose preview. JSON retains every condition, cohort, timing stratum and citation. */
export function formatBenchmark(report: BenchmarkReport): string {
  const lines = [`Recorded benchmark evidence · ${report.code}`,
    `${report.inventory.attempts.length} admissions · ${report.retainedReceipts} retained receipts · ${report.unassignedReceipts} unassigned receipts`,
    `${report.groupsWithMultipleCohorts} condition group(s) contain multiple ${report.axis} cohorts.`];
  for (const group of report.groups.slice(0, 10)) {
    lines.push(`\n${group.conditions.caseRef.id} · conditions ${group.conditionsDigest.hex.slice(0, 12)}`);
    for (const cohort of group.cohorts.slice(0, 4)) {
      const identity = report.axis === 'runner' ? `${cohort.runnerRef.id}@${cohort.runnerRef.revision}` :
        `${label(cohort.observedModel ?? 'unknown model')} (requested ${label(cohort.requestedModel ?? 'unknown')})`;
      lines.push(`  ${identity} · ${cohort.receipts.length} receipts · ${cohort.outcomes.map(o => `${o.outcome} ${o.count}`).join(', ')}`);
      lines.push(`    runner ${cohort.usage.runnerSeconds.toFixed(3)}s · recorded reconciled subtotal ${cohort.pricing.reconciledSubtotalCents ?? 'unknown'} cents · ${cohort.pricing.unreconciledReceipts} unreconciled`);
      for (const t of cohort.timings.slice(0, 3)) lines.push(
        `    ${t.metric} · ${label(t.boundary)}/${t.clock}/${t.temperature} · median ${t.medianMs ?? 'unknown'}ms (n=${t.numericUncensored}, censored=${t.censored}, missing=${t.missing})`);
      if (cohort.timings.length > 3) lines.push(`    ${cohort.timings.length - 3} additional timing strata in --json.`);
    }
    if (group.cohorts.length > 4) lines.push(`  ${group.cohorts.length - 4} additional cohorts in --json.`);
  }
  if (report.groups.length > 10) lines.push(`\n${report.groups.length - 10} additional condition groups in --json.`);
  lines.push(`\nFindings: ${report.findings.join(', ') || 'none'}`,
    'All checkpoint admissions retained. Recorded prices are not authenticated invoices; controlled conditions and statistical significance are not proven. No execution or recovery was performed.');
  return lines.join('\n');
}
