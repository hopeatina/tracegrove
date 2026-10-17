import { BrowserDriver, BrowserStepError } from './driver.ts';
import { BrowserAction, BrowserLocator, type BrowserObservation, type BrowserNetworkObservation, type CaseSpec, type Persona, type Step } from '../../protocol/index.ts';
import { applyTemplate, applyTemplateDeep } from '../../core/compiler.ts';
import { Deadline, sleep } from '../../core/deadline.ts';
import { monotonicMs } from '../../core/clock.ts';
import { evaluatePredicate } from '../../core/reducer.ts';

/** One lazy browser per case; all polls count against the same action budget. */
export class CaseBrowserSession {
  private browser: BrowserDriver | undefined;
  private actions = 0;
  private started: number | undefined;
  private elapsed = 0;
  private networkEvents = 0;
  constructor(private readonly input: { origin: string; spec: CaseSpec; persona: Persona; bearer: string | null;
    onNetwork: (observation: BrowserNetworkObservation) => void;
  }) {}

  async execute(step: Step, variables: Record<string, unknown>, deadline: Deadline, signal: AbortSignal): Promise<BrowserObservation> {
    if (!step.kind.startsWith('ui.')) throw new BrowserStepError('not_browser_step');
    if (!this.browser) {
      this.started = monotonicMs();
      const { persona, spec } = this.input;
      this.browser = await BrowserDriver.start({ origin: this.input.origin, deadline, signal,
        allowedMethods: spec.effects.allowedMethods.filter(method => spec.effects.mode !== 'read_only' || method === 'GET' || method === 'HEAD'), allowedResourcePrefixes: spec.effects.allowedResourcePrefixes,
        ...(this.input.bearer ? { bearer: this.input.bearer } : {}),
        onNetwork: observation => {
          if (++this.networkEvents > 512) throw new BrowserStepError('browser_network_metadata_limit');
          this.input.onNetwork(observation);
        },
        viewport: persona.viewport, locale: persona.locale, timezoneId: persona.timezone, reducedMotion: persona.reducedMotion, inputMode: persona.inputMode });
    }
    const command = step.kind === 'ui.navigate' ? { kind: 'navigate', path: applyTemplate(step.path, variables) }
      : step.kind === 'ui.action' ? BrowserAction.parse(applyTemplateDeep(step.command, variables))
      : step.kind === 'ui.observe' ? { kind: 'read', target: BrowserLocator.parse(applyTemplateDeep(step.target, variables)) } : null;
    if (!command) throw new BrowserStepError('not_browser_step');
    for (;;) {
      if (++this.actions > this.input.spec.limits.maxBrowserActions) throw new BrowserStepError('browser_action_limit');
      const observation = await this.browser.execute(command, deadline, signal);
      if (step.kind !== 'ui.observe' || evaluatePredicate(step.predicate, { browser: observation }).pass) return observation;
      if (deadline.expired()) throw new BrowserStepError('browser_timeout');
      await sleep(Math.min(step.pollIntervalMs, deadline.remainingMs()), deadline.signal(signal));
    }
  }

  get seconds(): number { return this.started === undefined ? 0 : this.elapsed || (monotonicMs() - this.started) / 1000; }

  async collectVideo(deadline: Deadline): Promise<Buffer | null> {
    if (!this.browser) return null;
    try {
      if (this.networkEvents > 512) throw new BrowserStepError('browser_network_metadata_limit');
      return await this.browser.collectVideo(Math.min(this.input.spec.limits.maxArtifactBytes, 16 * 1024 * 1024), deadline.child(5000));
    }
    finally {
      try { await this.browser.dispose(); }
      finally { this.elapsed = this.seconds; }
    }
  }
}
