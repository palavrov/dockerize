import path from 'path';

import execa from 'execa';
import fs from 'fs-extra';
import ow from 'ow';
import readPkgUp from 'read-pkg-up';
import tempy from 'tempy';

import {DEFAULT_TINI_VERSION} from 'etc/constants';
import {DockerizeArguments} from 'etc/types';
import log from 'lib/log';

import {
  computePackageEntry,
  copyPackageLockfile,
  copyNpmrc,
  ensureArray,
  getImageSize,
  getNodeLtsVersion,
  packAndExtractPackage,
  parseLabels,
  renderTemplate
} from 'lib/utils';


export default async function dockerize(options: DockerizeArguments) {
  ow(options.cwd, 'cwd', ow.string);
  ow(options.tag, 'tag', ow.any(ow.undefined, ow.string));
  ow(options.nodeVersion, 'Node version', ow.any(ow.undefined, ow.string));
  ow(options.labels, 'labels', ow.any(ow.undefined, ow.string, ow.array.ofType(ow.string)));
  ow(options.env, 'environment variables', ow.any(ow.undefined, ow.string, ow.array.ofType(ow.string)));
  ow(options.extraArgs, 'extra Docker arguments', ow.any(ow.undefined, ow.string));
  ow(options.dockerfile, 'custom Dockerfile', ow.any(ow.undefined, ow.string));
  ow(options.npmrc, '.npmrc file', ow.any(ow.undefined, ow.string));

  // Get path to a random temporary directory we will use as our staging area.
  const stagingDir = tempy.directory();

  // Get the path to the package's package.json and create the staging area.
  const [pkg] = await Promise.all([readPkgUp({cwd: options.cwd}), fs.ensureDir(stagingDir)]);

  if (!pkg) {
    throw new Error('Unable to locate a package.json for the local project.');
  }

  // Compute package root.
  const pkgRoot = path.dirname(pkg.path);

  // Compute path to the package's entrypoint ("bin" or "main").
  const entry = computePackageEntry(pkg.package);

  /**
   * Tag that will be applied to the image.
   *
   * Default: <package name>
   */
  const tag = options.tag || `${pkg.package.name.replace(/@/g, '')}:${pkg.package.version}`;

  /**
   * Additional labels to apply to the image.
   */
  const labels = parseLabels(options.labels);

  /**
   * Environment variables to set in the image.
   */
  const envVars = ensureArray(options.env);

  /**
   * Extra arguments to pass to `docker build`.
   */
  const extraArgs = options.extraArgs;

  /**
   * Path to a custom Dockerfile to use.
   */
  const customDockerfile = options.dockerfile;

  const [
    /**
     * Version of NodeJS that will be installed in the container.
     */
    nodeVersion,

    /**
     * Custom .npmrc file to use when installing packages.
     */
    hasNpmrc,

    /**
     * Resolves with `true` if the project has a lockfile.
     */
    hasLockfile
   ] = await Promise.all([
    options.nodeVersion || getNodeLtsVersion(),
    copyNpmrc(options.npmrc, stagingDir),
    copyPackageLockfile(pkgRoot, path.join(stagingDir, 'package'))
  ]);

  log.verbose('stagingDir', stagingDir);
  log.info('package', log.chalk.bold(pkg.package.name));
  log.verbose('root', pkgRoot);
  log.info('entry', entry);
  log.info('nodeVersion', nodeVersion);

  if (hasLockfile) {
    log.info('lockfile', 'Using package\'s lockfile.');
  } else {
    log.info('lockfile', 'Package does not have a lockfile.');
  }

  if (customDockerfile) {
    log.verbose('dockerfile', customDockerfile);
  }

  envVars.forEach(varExpression => {
    log.info('env', varExpression);
  });

  ensureArray(options.labels).forEach(labelExpression => {
    log.info('label', labelExpression);
  });

  if (extraArgs) {
    log.info('extraArgs', extraArgs);
  }

  log.info('tag', tag);

  const renderDockerfile = async () => {
    if (customDockerfile) {
      return fs.copy(customDockerfile, path.join(stagingDir, 'Dockerfile'));
    }

    return renderTemplate({
      template: path.join(__dirname, '..', 'etc', 'Dockerfile.ejs'),
      dest: path.join(stagingDir, 'Dockerfile'),
      data: {
        entry,
        envVars,
        hasLockfile,
        nodeVersion,
        tiniVersion: DEFAULT_TINI_VERSION,
        hasNpmrc
      }
    });
  };

  await Promise.all([
    // Copy production-relevant package files to the staging directory.
    packAndExtractPackage(pkgRoot, stagingDir),
    // Write Dockerfile.
    renderDockerfile()
  ]);

  const dockerBuildArgs = [
    '--rm',
    `--tag=${tag}`,
    `--label=NODE_VERSION=${nodeVersion}`,
    `--label=TINI_VERSION=${DEFAULT_TINI_VERSION}`,
    labels,
    extraArgs
  ].filter(Boolean) as Array<string>;

  log.silly('dockerCmd', `docker build . ${dockerBuildArgs.join(' ')}`);

  log.info('', 'Building image...');

  // Build image.
  await execa('docker', ['build', '.', ...dockerBuildArgs], {
    cwd: stagingDir,
    stdin: 'ignore',
    stdout: ['verbose', 'silly'].includes(log.level) ? 'inherit' : 'ignore',
    stderr: 'inherit'
  });

  // Get final image size and clean up staging directory.
  const [imageSize] = await Promise.all([
    getImageSize(tag),
    fs.remove(stagingDir)
  ]);

  log.info('', `Built image ${log.chalk.cyan.bold(tag)} (${imageSize})`);
}
