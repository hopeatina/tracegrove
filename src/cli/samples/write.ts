import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { Blocked } from '../../core/errors.ts';
import { ComponentProfile, LaunchRecipe } from '../../protocol/index.ts';
import { sourceIdentityDigest } from '../../hosts/local.ts';
import { SampleName } from './catalog.ts';
import { compileProject } from '../../authoring/compile.ts';

const HostTemplate = z.object({ launch: LaunchRecipe }).passthrough();
const ComponentTemplate = z.object({ components: ComponentProfile.shape.components }).passthrough();

/** Rebind only application inputs; shared cases, fixtures, oracles and fidelity stay identical. */
export function bindSampleApplication(root: string, launch: LaunchRecipe, runtime: string): void {
  const hostPath = join(root, 'verification/hosts/local-process.yaml');
  const host = HostTemplate.parse(parse(readFileSync(hostPath, 'utf8')));
  const componentPath = join(root, 'verification/components/notes-api.profile.yaml');
  const profile = ComponentTemplate.parse(parse(readFileSync(componentPath, 'utf8')));
  const component = profile.components.find(item => item.componentId === launch.componentId);
  if (!component) throw new Blocked([{ code: 'sample_component_missing', detail: launch.componentId }]);
  const identity = sourceIdentityDigest(root, launch.identitySourceFiles);
  component.expectedIdentity = { kind: 'source_digest', sourceDigest: { algorithm: 'sha256', hex: identity.hex }, runtime };
  writeFileSync(hostPath, stringify({ ...host, launch: LaunchRecipe.parse(launch) }));
  writeFileSync(componentPath, stringify(profile));
}

export function writeSample(samplesRoot: string, name: SampleName, output: string): string {
  SampleName.parse(name);
  if (existsSync(output) && readdirSync(output).length) throw new Blocked([{ code: 'sample_output_not_empty',
    detail: output, action: 'choose an empty output directory; existing files are never overwritten' }]);
  mkdirSync(output, { recursive: true });
  cpSync(join(samplesRoot, 'notes-api'), output, { recursive: true });
  if (name === 'report-jobs') {
    for (const owned of ['tracegrove', 'verification', 'app/app.mjs']) rmSync(join(output, owned), { recursive: true, force: true });
    cpSync(join(samplesRoot, name), output, { recursive: true });
    return compileProject(join(output, 'tracegrove.config.yaml')).workflowConfigPath;
  }
  if (name === 'notes-browser') cpSync(join(samplesRoot, name), output, { recursive: true });
  if (name === 'notes-django') {
    cpSync(join(samplesRoot, name), output, { recursive: true });
    rmSync(join(output, 'app/app.mjs'));
    const host = HostTemplate.parse(parse(readFileSync(join(output, 'verification/hosts/local-process.yaml'), 'utf8')));
    bindSampleApplication(output, { ...host.launch, command: '.venv/bin/python', args: ['app/django_app.py'],
      identitySourceFiles: ['app/django_app.py', 'app/requirements.lock'] }, 'python3.13');
  }
  if (name !== 'notes-django') {
    const host = HostTemplate.parse(parse(readFileSync(join(output, 'verification/hosts/local-process.yaml'), 'utf8')));
    bindSampleApplication(output, host.launch, 'node22');
  }
  return join(output, 'verification/workflow.yaml');
}
