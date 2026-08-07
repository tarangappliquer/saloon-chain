const { execSync } = require('child_process');
const http = require('http');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const rawArgs = hideBin(process.argv);
const argv = yargs(rawArgs)
  .option('url', {
    type: 'string',
    default: 'http://localhost:58569',
    describe: 'Target application URL to check',
  })
  .option('exec', {
    type: 'string',
    demandOption: true,
    describe: 'Test command to execute',
  })
  .option('server', {
    type: 'string',
    default: 'dev',
    describe: 'Npm dev server script name',
  })
  .strict()
  .help()
  .argv;

// Enforce strict options validation; reject unquoted positional tokens
if (argv._ && argv._.length > 0) {
  console.error('Error: Unquoted arguments or unexpected positionals detected. Please quote option values (e.g. --exec "cypress run --headed" or --url="http://localhost:58569").');
  process.exit(1);
}

function cleanArg(val) {
  return String(val ?? '')
    .trim()
    .replace(/^["'\\]+|["'\\]+$/g, '')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .trim();
}

const targetUrl = cleanArg(argv.url);
const serverCmd = cleanArg(argv.server);
const testCmd = cleanArg(argv.exec);

function isServerRunning(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

(async () => {
  const running = await isServerRunning(targetUrl);
  const fullCmd = testCmd.startsWith('npx ') ? testCmd : `npx ${testCmd}`;

  if (running) {
    console.log(`Server at ${targetUrl} is already running. Skipping dev server start and executing tests directly...`);
    try {
      execSync(fullCmd, { stdio: 'inherit' });
    } catch (err) {
      process.exit(err.status || 1);
    }
  } else {
    console.log(`Server at ${targetUrl} is not running. Starting dev server (${serverCmd}) and waiting for response...`);
    try {
      execSync(`npx start-server-and-test ${serverCmd} ${targetUrl} "${fullCmd}"`, { stdio: 'inherit' });
    } catch (err) {
      process.exit(err.status || 1);
    }
  }
})();
