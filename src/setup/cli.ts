import { pathToFileURL } from "node:url";

import { runChecks } from "./checks.js";
import { writeDefaultConfig } from "./config.js";

export async function main(args = process.argv.slice(2)): Promise<number> {
  const writeConfig = args.includes("--write-config");
  const report = await runChecks();
  process.stdout.write("Frobb Bridge readiness\n\n");
  for (const check of report.checks) {
    const status = check.ok ? "PASS" : check.required ? "FAIL" : "OPTIONAL";
    process.stdout.write(`${status.padEnd(8)} ${check.label}\n`);
    if (!check.ok) process.stdout.write(`         ${check.remediation}\n`);
  }
  if (writeConfig) process.stdout.write(`\nConfig: ${await writeDefaultConfig()}\n`);
  process.stdout.write(`\n${report.ready ? "Ready for local use." : "Required setup remains."}\n`);
  return report.ready ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
