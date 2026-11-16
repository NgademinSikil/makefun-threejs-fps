// Ember Yard hand-in: stages the finished game for the make.fun scorer.
// What this script does, in order:
//   1. Works out where it lives on disk, and where the hand-in goes
//      (MAKEFUN_OUTPUT_DIR when set, otherwise the platform's /output).
//   2. Stages a fresh copy of the playable game and its screenshots
//      into that output directory.
//   3. Asks the vendored make.fun library to summarise the staged
//      entry and writes that summary as dossier.json beside them.
// It is intentionally boring: no build step, no network, no extra
// dependencies — only the Node standard library and the vendored
// make.fun dossier helper. Run it exactly like the README says:
//   MAKEFUN_OUTPUT_DIR=out node main.ts   (after mkdir -p out)
// To play instead of handing in, run `node serve.ts` and open
// http://localhost:8080 in a desktop browser.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import * as dossierLib from './vendor/makefun-threejs.ts';

// The folder this file sits in: the entry root, holding game/ and
// screenshots/ next to it.
const entryRoot = path.dirname(url.fileURLToPath(import.meta.url));

// Where the staged entry goes. The grader sets MAKEFUN_OUTPUT_DIR;
// outside the grader it defaults to the platform output directory.
function destinationDir(): string {
  return process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
}

// The scorer's own limits, taken from the bounty gate: the text budget
// shapes the dossier, the rest only refuse an entry the scorer would
// refuse anyway (too many screenshots, an oversized screenshot, or a
// game/ tree past the file-count / byte caps).
const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

// Stages one folder of the entry into the output directory: creates
// the destination, then copies the source tree into it when the source
// exists. A missing game/ still fails here, exactly as the copy in the
// original hand-in would, because there is nothing to hand in.
function stageFolder(sourceName: string, target: string): void {
  fs.mkdirSync(target, { recursive: true });
  const source = path.join(entryRoot, sourceName);
  if (fs.existsSync(source)) {
    fs.cpSync(source, target, { recursive: true });
  }
}

const outDir = destinationDir();

fs.mkdirSync(outDir, { recursive: true });
stageFolder('game', path.join(outDir, 'game'));
stageFolder('screenshots', path.join(outDir, 'screenshots'));

const dossierBytes = dossierLib.buildDossier(outDir, dossierCaps);
fs.writeFileSync(path.join(outDir, 'dossier.json'), dossierBytes);
