import {Arguments} from 'yargs';

/**
 * Options object accepted by Dockerize.
 */
export interface DockerizeArguments extends Arguments {
  /**
   * Tag that will be applied to the image.
   *
   * Default: <package name>
   */
  tag?: string;

  /**
   * Version of NodeJS that will be installed in the container.
   *
   * Default: LTS (see nodejs.org)
   */
  nodeVersion?: string;

  /**
   * Additional labels to apply to the image.
   *
   * See: https://docs.docker.com/engine/reference/commandline/build/
   */
  labels?: Array<string>;

  /**
   * Environment variables to set in the image.
   *
   * See: https://docs.docker.com/engine/reference/builder/#env
   */
  env?: Array<string>;

  /**
   * Extra command-line arguments to pass to `docker build`.
   *
   * See: https://docs.docker.com/engine/reference/commandline/build/
   */
  extraArgs?: string;

  /**
   * Path to a custom Dockerfile to use.
   */
  dockerfile?: string;

  /**
   * Path to an .npmrc file to use when installing dependencies in the image.
   * This file will be removed from the final image.
   */
  npmrc?: string;
}
