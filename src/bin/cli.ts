#!/usr/bin/env node

import yargs, {Arguments} from 'yargs';

import {DockerizeOptions} from 'etc/types';
import dockerize from 'lib/dockerize';
import log from 'lib/log';


yargs.usage('Easily Dockerize a NodeJS project.');

yargs.option('tag', {
  group: 'Optional Arguments:',
  description: 'Tag to use for the image. [Default: Package name]',
  required: false,
  type: 'string'
});

yargs.option('nodeVersion', {
  group: 'Optional Arguments:',
  description: 'Node version to install in the image. [Default: LTS]',
  required: false,
  type: 'string',
  conflicts: ['dockerfile']
});

yargs.option('label', {
  group: 'Optional Arguments:',
  description: 'Labels to apply to the image. May be used multiple times.',
  required: false,
  type: 'string'
});

yargs.option('env', {
  group: 'Optional Arguments:',
  description: 'Environment variables to set in the image. May be used multiple times.',
  required: false,
  type: 'string',
  conflicts: ['dockerfile']
});

yargs.option('extraArgs', {
  group: 'Optional Arguments:',
  description: 'Optional extra arguments to pass to "docker build"; should be wrapped in quotes.',
  required: false,
  type: 'string'
});

yargs.option('dockerfile', {
  group: 'Optional Arguments:',
  description: 'Path to a custom Dockerfile to use.',
  required: false,
  type: 'string',
  conflicts: ['npmrc', 'nodeVersion']
});

yargs.option('npmrc', {
  group: 'Optional Arguments:',
  description: 'Path to an .npmrc file to use when installing packages.\nOr set to true to use the closest .npmrc file.',
  required: false,
  type: 'string',
  conflicts: ['dockerfile']
});

yargs.example('$0', 'Dockerize the NodeJS project in the current directory using default options.');

yargs.showHelpOnFail(true, 'See --help for usage instructions.');
yargs.wrap(yargs.terminalWidth());
yargs.alias('v', 'version');
yargs.alias('h', 'help');
yargs.version();
yargs.strict();
yargs.help();


async function main() {
  try {
    // Log level is 'silent' by default for Node API use cases; set it to
    // LOG_LEVEL or 'info' by default for CLI use.
    log.level = process.env.LOG_LEVEL || 'info';

    // Parse command-line arguments, bail on --help, --version, etc.
    const args = yargs.argv as DockerizeOptions & Arguments;

    // Pluralize 'label' when passing options to dockerize.
    // @ts-ignore
    args.labels = args.label;
    Reflect.deleteProperty(args, 'label');

    await dockerize(args);
  } catch (err) {
    // console.log('MESSAGE:', err.message);
    // console.log('STACK:', err.stack);
    const [message, ...stack] = err.stack.split('\n');
    log.error('', message);
    log.verbose('', stack.join('\n'));
    process.exit(1);
  }
}


export default main();
