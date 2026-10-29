interface SpawnCommand {
  command: string;
  args: string[];
}

export function resolveNovelForgeCliPath(venvPythonPath: string): string {
  return process.platform === "win32"
    ? venvPythonPath.replace(/python\.exe$/i, "openfic.exe")
    : venvPythonPath.replace(/python$/i, "openfic");
}
export function createNovelForgeVersionCommand(venvPythonPath: string): SpawnCommand {
  return {
    command: venvPythonPath,
    args: ["-c", 'from importlib.metadata import version; print(version("openfic"))'],
  };
}

export function createNovelForgeInstallCommand(
  venvPythonPath: string,
  version: string,
  forceReinstall = false,
): Omit<SpawnCommand, "command"> {
  return {
    args: ["pip", "install", "--python", venvPythonPath, ...(forceReinstall ? ["--reinstall"] : []), `openfic==${version}`],
  };
}

export function createNovelForgeServeCommand(venvPythonPath: string, port: number): SpawnCommand {
  return {
    command: resolveNovelForgeCliPath(venvPythonPath),
    args: ["serve", "--host", "127.0.0.1", "--port", String(port)],
  };
}
