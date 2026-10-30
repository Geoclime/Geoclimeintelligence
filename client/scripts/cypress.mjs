// Runs the Cypress CLI with the arguments given ("run" or "open").
//
// VS Code's integrated terminal, like other Electron apps, exports ELECTRON_RUN_AS_NODE=1. Cypress
// is an Electron app too, so with that set its binary starts as plain Node and fails with
// "bad option: --smoke-test". Clearing it here makes `npm run e2e` work from any terminal.
import { spawnSync } from "node:child_process";

delete process.env.ELECTRON_RUN_AS_NODE;

// shell: true so Windows finds cypress.cmd in node_modules/.bin (npm puts it on PATH).
const result = spawnSync("cypress", process.argv.slice(2), { stdio: "inherit", shell: true, env: process.env });
process.exit(result.status ?? 1);
