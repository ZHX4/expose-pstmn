#!/usr/bin/env node

import { createRequire } from "node:module";

import { getHelpText, runCli } from "./core/cli.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

const exitCode = await runCli(process.argv.slice(2), {
  version: packageJson.version,
  help: getHelpText(),
});

process.exitCode = exitCode;
