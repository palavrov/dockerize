#!/usr/bin/env node

import yargs from 'yargs';

import {DockerizeArguments} from 'etc/types';
import dockerize from 'lib/dockerize';
import log from 'lib/log';


yargs.command({
  command: '* [cwd]',
  describe: '',
  builder: command => {
    command.usage('Easily Dockerize a NodeJS project.');

    command.positional('cwd', {
      description: 'Directory of the project to Dockerize.',
      type: 'string',
      required: false
    });

    command.option('tag', {
      group: 'Optional Arguments:',
      description: 'Tag to use for the image. [Default: Package name]',
      required: false,
      type: 'string'
    });

    command.option('node-version', {
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

    command.option('extra-args', {
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
    command.example('$0 --label="foo=bar" --label="baz=qux" --extra-args="--squash"', 'Dockerize the NodeJS project in the current directory, apply two labels, and pass the --squash argument to Docker.');

    return command;
  },
  handler: async (args: DockerizeArguments) => {
    try {
      // Log level is 'silent' by default for Node API use cases; set it to
      // LOG_LEVEL or 'info' by default for CLI use.
      log.configure({
        level: process.env.LOG_LEVEL || 'info'
      });

      // Pluralize 'label' when passing options to dockerize.
      // @ts-ignore
      args.labels = args.label;
      Reflect.deleteProperty(args, 'label');

      // Set cwd to the current directory if it was not set by the user.
      args.cwd = args.cwd || process.cwd();

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
