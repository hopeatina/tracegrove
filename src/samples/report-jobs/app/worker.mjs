import { setTimeout as pause } from 'node:timers/promises';
import { JobStore } from './store.mjs';

const store = new JobStore(process.argv[2]);
let busy = false;
const tick = async () => {
  if (busy) return;
  busy = true;
  try {
    const job = store.claim();
    if (!job) return;
    // Hold mode exercises a genuine worker acknowledgement of cancellation.
    while (job.mode === 'hold' && store.get(job.id)?.status === 'running') await pause(25);
    store.finish(job.id, process.env.REPORTS_TEST_DROP_REPORT === '1');
  } catch { process.exitCode = 1; shutdown(); }
  finally { busy = false; }
};
const timer = setInterval(() => { void tick(); }, 25);
function shutdown() { clearInterval(timer); store.close(); process.exit(process.exitCode ?? 0); }
process.on('SIGTERM', shutdown);
process.on('disconnect', shutdown);
process.send?.({ type: 'ready' });
