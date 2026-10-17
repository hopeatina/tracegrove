/** One qualified Django bootstrap shared by authoring and the source-owning supervisor. */
export function djangoBootstrap(port: string): string {
  return `import os, subprocess, sys; subprocess.run([sys.executable, 'manage.py', 'migrate', '--noinput'], check=True); os.execv(sys.executable, [sys.executable, 'manage.py', 'runserver', '127.0.0.1:${port}', '--noreload'])`;
}
