#!/usr/bin/env node
import { Command } from "commander";
import { loadRootEnv } from "./lib/env";
import { initCommand } from "./commands/init";
import { provisionCommand } from "./commands/provision";
import { verifyCommand } from "./commands/verify";
import { doctorCommand } from "./commands/doctor";
import { checkCommand } from "./commands/check";

loadRootEnv();

const program = new Command();
program.name("frontdesk").description("Installer and verification toolkit for AI front desk client installs");

program
  .command("init")
  .requiredOption("--client <id>", "client id")
  .description("Scaffold a client folder from clients/_template and validate it")
  .action((opts: { client: string }) => {
    initCommand(opts.client);
  });

program
  .command("provision")
  .requiredOption("--client <id>", "client id")
  .option("--dry-run", "print steps without making changes")
  .option("--url <url>", "deployed site URL, needed for the Twilio step")
  .description("Provision Supabase, Vercel, Workers, Twilio, and ElevenLabs for a client. Idempotent.")
  .action(async (opts: { client: string; dryRun?: boolean; url?: string }) => {
    await provisionCommand(opts.client, opts);
  });

program
  .command("verify")
  .requiredOption("--client <id>", "client id")
  .option("--url <url>", "deployed site URL to verify against")
  .option("--json", "also print machine-readable JSON output")
  .description("Run every install gate and print a PASS/FAIL/SKIPPED table")
  .action(async (opts: { client: string; url?: string; json?: boolean }) => {
    await verifyCommand(opts.client, opts);
  });

program
  .command("check")
  .requiredOption("--target <path>", "path to a target config JSON file (see examples/target-config.example.json)")
  .option("--json", "also print machine-readable JSON output")
  .description("Run the portable install gates (URL + vendor credentials only) against any AI receptionist install, not just this repo's own")
  .action(async (opts: { target: string; json?: boolean }) => {
    await checkCommand(opts);
  });

program
  .command("doctor")
  .requiredOption("--client <id>", "client id")
  .option("--url <url>", "deployed site URL")
  .description("Check a live client install for drift from its config")
  .action(async (opts: { client: string; url?: string }) => {
    await doctorCommand(opts.client, opts);
  });

program.parseAsync(process.argv);
