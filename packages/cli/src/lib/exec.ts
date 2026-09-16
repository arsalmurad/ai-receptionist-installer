import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "./paths";

export interface ExecResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function run(command: string, args: string[], opts: { input?: string; cwd?: string } = {}): ExecResult {
  const result = spawnSync(command, args, {
    cwd: opts.cwd ?? REPO_ROOT,
    input: opts.input,
    encoding: "utf-8",
    shell: process.platform === "win32",
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
