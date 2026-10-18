// @ts-check
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { z } from 'zod';

const LocalEndpoint = z.string().regex(/^unix:\/\/\/.+$/, 'Anonymous qualification requires a local Unix Docker socket');
const DaemonId = z.string().trim().min(1).max(128);
const PluginPath = z.string().trim().min(1).refine(isAbsolute, 'Docker must report an absolute buildx plugin path');
/** @typedef {(args: string[], environment: NodeJS.ProcessEnv) => string} Probe */

/** One immutable client environment; public-image mode never copies registry credentials. */
export class DockerClient {
  #disposed = false;
  /** @type {string | null} */ #configDirectory = null;
  /** @type {string | null} */ daemonId = null;
  /** @type {'default' | 'anonymous_public_registry'} */ mode;
  /** @param {string} cwd
   * @param {boolean} anonymousPublicRegistry
   * @param {{environment?: NodeJS.ProcessEnv, probe?: Probe, temporaryRoot?: string}} dependencies */
  constructor(cwd, anonymousPublicRegistry = false, dependencies = {}) {
    this.cwd = cwd;
    this.mode = z.boolean().parse(anonymousPublicRegistry) ? 'anonymous_public_registry' : 'default';
    this.environment = { ...(dependencies.environment ?? process.env) };
    const probe = dependencies.probe ?? ((args, environment) => this.#invoke(args, environment, 15000));
    if (this.mode === 'anonymous_public_registry') {
      try {
        const endpoint = LocalEndpoint.parse(this.environment.DOCKER_CONTEXT || !this.environment.DOCKER_HOST
          ? probe(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], this.environment).trim()
          : this.environment.DOCKER_HOST);
        this.daemonId = DaemonId.parse(probe(['info', '--format', '{{.ID}}'], this.environment));
        const plugin = PluginPath.parse(probe(['info', '--format', '{{range .ClientInfo.Plugins}}{{if eq .Name "buildx"}}{{.Path}}{{end}}{{end}}'], this.environment));
        this.#configDirectory = mkdtempSync(join(dependencies.temporaryRoot ?? tmpdir(), 'tracegrove-public-docker-'));
        writeFileSync(join(this.#configDirectory, 'config.json'), JSON.stringify({ auths: {}, cliPluginsExtraDirs: [dirname(plugin)] }), { mode: 0o600 });
        this.environment.DOCKER_CONFIG = this.#configDirectory;
        this.environment.DOCKER_HOST = endpoint;
        delete this.environment.DOCKER_CONTEXT;
        if (DaemonId.parse(probe(['info', '--format', '{{.ID}}'], this.environment)) !== this.daemonId) throw new Error('Anonymous client resolved a different Docker daemon');
      } catch (error) { this.dispose(); throw error; }
    }
    Object.freeze(this.environment);
  }
  /** @param {string[]} args @param {NodeJS.ProcessEnv} environment @param {number} timeout */
  #invoke(args, environment, timeout) {
    const result = spawnSync('docker', args, { cwd: this.cwd, env: environment, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error(`docker ${args[0]} failed: ${result.stderr || result.error?.message || result.status}`);
    return result.stdout.trim();
  }
  /** @param {string[]} args @param {number} timeout */
  run(args, timeout = 180000) {
    if (this.#disposed) throw new Error('Docker client has been disposed');
    return this.#invoke(args, this.environment, timeout);
  }
  get metadata() { return { mode: this.mode, daemonId: this.daemonId, temporaryConfigRemoved: this.#configDirectory === null }; }
  dispose() {
    if (this.#configDirectory) {
      const owned = this.#configDirectory; rmSync(owned, { recursive: true, force: true });
      if (existsSync(owned)) throw new Error('Temporary Docker client configuration remains');
      this.#configDirectory = null;
    }
    this.#disposed = true;
  }
}
