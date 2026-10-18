import { validJobInput } from './store.mjs';

/** The application owns auth and queue semantics; the worker and SQLite store remain real. */
export function nativeBridge(store, tokens, workerReady) {
  if (process.env.TRACEGROVE_NATIVE_JOBS !== 'node_ipc/v1') return () => {};
  const empty = status => ({ jobId: null, status, requestKey: null, output: null, workerId: null });
  process.on('message', request => {
    if (request?.kind !== 'tracegrove.job.request') return;
    const { command, credential } = request;
    const owner = Object.hasOwn(tokens, credential) ? tokens[credential] : null;
    let result = empty('forbidden');
    if (typeof owner === 'string' && command.queue === 'reports') {
      let job;
      if (command.action === 'submit') {
        const input = { ...command.payload, requestKey: command.requestKey };
        if (!workerReady() || !validJobInput(input)) result = empty('conflict');
        else { const submitted = store.submit(owner, input); job = submitted.job; if (submitted.conflict) result = empty('conflict'); }
      } else {
        job = store.get(command.jobId);
        if (!job) result = empty('missing');
        else if (job.owner_id !== owner) { job = null; result = empty('forbidden'); }
        else if (command.action === 'cancel') { store.requestCancel(job.id); job = store.get(job.id); }
      }
      if (job) result = { jobId: job.id, status: job.status, requestKey: job.request_key,
        output: { report: store.report(job.id), apiPid: process.pid, totalJobs: store.list(owner).length }, workerId: job.worker_pid ? String(job.worker_pid) : null };
    }
    process.send?.({ kind: 'tracegrove.job.response', id: request.id, result });
  });
  return () => process.send?.({ kind: 'tracegrove.job.ready', version: 1, queues: ['reports'] });
}
