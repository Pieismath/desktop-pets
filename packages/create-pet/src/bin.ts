#!/usr/bin/env node
import { runCli, stdioCliIO } from './cli.js';

runCli(process.argv.slice(2), stdioCliIO())
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
