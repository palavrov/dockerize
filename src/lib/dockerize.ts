import path from 'path';

import execa from 'execa';
import fs from 'fs-extra';
import ow from 'ow';
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
  pkgInfo,
  renderTemplate
} from 'lib/utils';


export default async function dockerize(options: DockerizeArguments) {
  await ensureDocker();


  // ----- [1] Validate Options ------------------------------------------------

  ow(options.cwd, 'cwd', ow.string);
  ow(options.tag, 'tag', ow.any(ow.undefined, ow.string));
  ow(options.nodeVersion, 'Node version', ow.any(ow.undefined, ow.string));
  ow(options.labels, 'labels', ow.any(ow.undefined, ow.string, ow.array.ofType(ow.string)));
  ow(options.env, 'environment variables', ow.any(ow.undefined, ow.string, ow.array.ofType(ow.string)));
  ow(options.extraArgs, 'extra Docker arguments', ow.any(ow.undefined, ow.string));
  ow(options.dockerfile, 'custom Dockerfile', ow.any(ow.undefined, ow.string));
  ow(options.npmrc, '.npmrc file', ow.any(ow.undefined, ow.string));
  ow(options.push, 'push', ow.any(ow.undefined, ow.boolean));


  // ----- [2] Prepare Staging Area --------------------------------------------

  // Get path to a random temporary directory we will use as our staging area.
  const stagingDir = tempy.directory();
  await fs.ensureDir(stagingDir);


  // ----- [3] Introspect Host Package -----------------------------------------

  // Get the path to the package's package.json and create the staging area.
  const pkg = await pkgInfo({cwd: options.cwd});

  // Compute path to the package's entrypoint ("bin" or "main"). This will be
  // used as the ENTRYPOINT in the final image.
  const entry = computePackageEntry(pkg.package);


  // ----- [4] Parse Docker Options --------------------------------------------

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
  const envVars = ensureArray<string>(options.env);

  /**
   * Extra arguments to pass to `docker build`.
   */
  const extraArgs = options.extraArgs;

  /**
   * Path to a custom Dockerfile to use.
   */
  const customDockerfile = options.dockerfile;


  // ----- [5] Compute Node Version, Copy .npmrc, Copy Lockfile ----------------

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
    copyPackageLockfile(pkg.root, path.join(stagingDir, 'package'))
  ]);


  // ----- [6] Build Docker Command --------------------------------------------

  const dockerBuildArgs = [
    '--rm',
    `--tag=${tag}`,
    `--label=NODE_VERSION=${nodeVersion}`,
    `--label=TINI_VERSION=${DEFAULT_TINI_VERSION}`,
    labels,
    extraArgs
  ].filter(Boolean) as Array<string>;


  // ----- [7] Log Build Metadata ----------------------------------------------

  log.info(`Dockerizing package ${log.chalk.green.bold(pkg.package.name)}.`);
  log.info(`⁃ Entrypoint: ${log.chalk.green(entry)}`);
  log.info(`⁃ Node Version: ${log.chalk.bold(nodeVersion)}`);
  log.verbose(`⁃ Lockfile: ${log.chalk[hasLockfile ? 'green' : 'yellow'].bold(String(hasLockfile))}`);

  if (envVars.length) {
    log.info('⁃ Environment Variables:');

    envVars.forEach(varExpression => {
      const [key, value] = varExpression.split('=');
      log.info(`  ⁃ ${key}=${value}`);
    });
  }

  if (options.labels) {
    log.info('⁃ Labels:');

    ensureArray<string>(options.labels).forEach(labelExpression => {
      const [key, value] = labelExpression.split('=');
      log.info(`  ⁃ ${key}: ${value}`);
    });
  }

  if (customDockerfile) {
    log.info(`⁃ Custom Dockerfile: ${log.chalk.green(customDockerfile)}`);
  }

  log.verbose(`⁃ Package Root: ${log.chalk.green(pkg.root)}`);
  log.verbose(`⁃ Staging Directory: ${log.chalk.green(stagingDir)}`);

  if (extraArgs) {
    log.verbose(`⁃ Extra Docker Args: ${extraArgs}`);
  }

  log.verbose(`⁃ Docker Command: "docker build ${dockerBuildArgs.join(' ')} ."`);


  // ----- [8] Pack Package & Render Dockerfile --------------------------------

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

  const buildTime = log.createTimer();
  const spinner = log.createSpinner();
  const endBuildInteractive = log.beginInteractive(() => log.info(`${spinner} Building image ${log.chalk.cyan.bold(tag)}...`));

  await Promise.all([
    // Copy production-relevant package files to the staging directory.
    packAndExtractPackage(pkg.root, stagingDir),
    // Write Dockerfile.
    renderDockerfile()
  ]);


  // ----- [9] Build Image -----------------------------------------------------

  const buildProcess = execa('docker', ['build', '.', ...dockerBuildArgs], {
    cwd: stagingDir,
    stdin: 'ignore',
    stdout: log.isLevelAtLeast('silly') ? 'pipe' : 'ignore',
    stderr: log.isLevelAtLeast('silly') ? 'pipe' : 'ignore',
  });

  if (buildProcess.stdout) {
    buildProcess.stdout.pipe(log.createPipe('silly'));
  }

  if (buildProcess.stderr) {
    buildProcess.stderr.pipe(log.createPipe('silly'));
  }

  await buildProcess;


  // ----- [10] Compute Image Size & Clean Up ----------------------------------

  const [imageSize] = await Promise.all([
    getImageSize(tag),
    fs.remove(stagingDir)
  ]);

  endBuildInteractive(() => log.info(`🏁 Built image ${log.chalk.cyan.bold(tag)} ${log.chalk.dim(`(${imageSize})`)} in ${buildTime}.`));


  // ----- [11] (Optional) Push Image ------------------------------------------

  if (!options.push) {
    return;
  }

  const pushTime = log.createTimer();
  const endPushInteractive = log.beginInteractive(() => log.info(`${spinner} Pushing image ${log.chalk.cyan.bold(tag)}...`));

  const pushProcess = execa('docker', ['push', tag], {
    stdin: 'ignore',
    stdout: log.isLevelAtLeast('silly') ? 'pipe' : 'ignore',
    stderr: log.isLevelAtLeast('silly') ? 'pipe' : 'ignore',
  });

  if (pushProcess.stdout) {
    pushProcess.stdout.pipe(log.createPipe('silly'));
  }

  if (pushProcess.stderr) {
    pushProcess.stderr.pipe(log.createPipe('silly'));
  }

  await pushProcess;

  endPushInteractive(() => log.info(`🚀 Pushed image ${log.chalk.cyan.bold(tag)} in ${pushTime}.`));
}
