import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "./paths";

export interface ExecResult {
  status: number;
  stdout: string;
  stderr: string;
}

function quoteArg(arg: string): string {
  // Node warns (DEP0190) about passing a separate args array together with
  // shell:true, because escaping then becomes the shell's job, not Node's.
  // Windows needs shell:true to resolve .cmd shims (npm, vercel, wrangler),
  // so instead we build one already-quoted command string ourselves and
  // pass no separate args - safe here because every value this CLI shells
  // out with is a URL, hex secret, or short name, never containing quotes.
  return `"${arg.replace(/"/g, '\\"')}"`;
}

export function run(command: string, args: string[], opts: { input?: string; cwd?: string } = {}): ExecResult {
  const useShell = process.platform === "win32";
  const fullCommand = useShell ? [command, ...args.map(quoteArg)].join(" ") : command;
  const result = spawnSync(fullCommand, useShell ? [] : args, {
    cwd: opts.cwd ?? REPO_ROOT,
    input: opts.input,
    encoding: "utf-8",
    shell: useShell,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
