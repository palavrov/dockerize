#!/usr/bin/env node

import yargs from 'yargs';

import {DockerizeArguments} from 'etc/types';
import dockerize from 'lib/dockerize';
import log from 'lib/log';


yargs.command({
  command: '*',
  describe: '',
  builder: command => {
    command.usage('Easily Dockerize a NodeJS project.');

    command.option('tag', {
      group: 'Optional Arguments:',
      description: 'Tag to use for the image. [Default: Package name]',
      required: false,
      type: 'string'
    });

    command.option('nodeVersion', {
      group: 'Optional Arguments:',
      description: 'Node version to install in the image. [Default: LTS]',
      required: false,
      type: 'string',
      conflicts: ['dockerfile']
    });

    command.option('label', {
      group: 'Optional Arguments:',
      description: 'Labels to apply to the image. May be used multiple times.',
      required: false,
      type: 'string'
    });

    command.option('env', {
      group: 'Optional Arguments:',
      description: 'Environment variables to set in the image. May be used multiple times.',
      required: false,
      type: 'string',
      conflicts: ['dockerfile']
    });

    command.option('extraArgs', {
      group: 'Optional Arguments:',
      description: 'Optional extra arguments to pass to "docker build"; should be wrapped in quotes.',
      required: false,
      type: 'string'
    });

    command.option('dockerfile', {
      group: 'Optional Arguments:',
      description: 'Path to a custom Dockerfile to use.',
      required: false,
      type: 'string',
      conflicts: ['npmrc', 'nodeVersion']
    });

    command.option('npmrc', {
      group: 'Optional Arguments:',
      description: 'Path to an .npmrc file to use when installing packages.\nOr set to true to use the closest .npmrc file.',
      required: false,
      type: 'string',
      conflicts: ['dockerfile']
    });

    command.example('$0', 'Dockerize the NodeJS project in the current directory using default options.');

    return command;
  },
  handler: async (args: DockerizeArguments) => {
    try {
      // Log level is 'silent' by default for Node API use cases; set it to
      // LOG_LEVEL or 'info' by default for CLI use.
      log.level = process.env.LOG_LEVEL || 'info';

      // Pluralize 'label' when passing options to dockerize.
      // @ts-ignore
      args.labels = args.label;
      Reflect.deleteProperty(args, 'label');

      await dockerize(args);
    } catch (err) {
      const [message, ...stack] = err.stack.split('\n');
      log.error('', message);
      log.verbose('', stack.join('\n'));
      process.exit(1);
    }
  }
});


yargs.showHelpOnFail(true, 'See --help for usage instructions.');
yargs.wrap(yargs.terminalWidth());
yargs.alias('v', 'version');
yargs.alias('h', 'help');
yargs.version();
yargs.strict();
yargs.help();


// Parse command-line arguments, bail on --help, --version, etc.
export default yargs.argv;
