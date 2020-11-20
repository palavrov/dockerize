import path from 'path';

import chex from '@darkobits/chex';
import nodeVersons from '@darkobits/node-versions';
import bytes from 'bytes';
import ejs from 'ejs';
import findUp from 'find-up';
import fs from 'fs-extra';
import readPkgUp, {NormalizedPackageJson, Options} from 'read-pkg-up';
import tar from 'tar';

import {DOCKER_IMAGE_PATTERN} from 'etc/constants';
import {ThenArg} from 'etc/types';


/**
 * If the provided value is an array, it is returned as-is. Otherwise, the value
 * is wrapped in an array and returned.
 */
export function ensureArray<T = any>(value: any): Array<T> {
  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [value];
}


/**
 * Provided a string (or an array of strings), returns a string of label
 * arguments suitable for passing to `docker build`.
 */
export function parseLabels(labels: any) {
  return ensureArray(labels).map(labelExpression => {
    return `--label=${labelExpression}`;
  }).join(' ');
}


/**
 * Object returned by `pkgInfo`.
 */
export interface PkgInfoResult {
  /**
   * Object containing the parsed/normalized contents of the package's
   * package.json.
   */
  package: NormalizedPackageJson;

  /**
   * Root directory of the package.
   *
   * Note: This is _not_ the path to its package.json.
   */
  root: string;
}


/**
 * Wraps `readPkgUp` and automatically throws if a package.json file could not
 * be found.
 */
export async function pkgInfo(opts?: Options): Promise<PkgInfoResult> {
  const pkg = await readPkgUp({
    ...opts,
    // Even though this is `true` by default, we need it here because the
    // typings for read-pkg-up are wonky and without it, we wont get the right
    // type for our results.
    normalize: true
  });

  if (!pkg) {
    if (opts?.cwd) {
      throw new Error(`Unable to find a "package.json" for the package at ${opts.cwd}.`);
    }

    throw new Error('Unable to find a "package.json".');
  }

  const root = path.dirname(pkg.path);

  return {
    package: pkg.packageJson,
    root
  };
}


/**
 * Provided a normalized package.json object, returns its first "bin" entry or,
 * if the package does not declare a "bin", its "main" entry.
 */
export function computePackageEntry(pkg: NormalizedPackageJson) {
  if (pkg.bin) {
    return Object.values(pkg.bin)[0];
  }

  if (pkg.main) {
    return pkg.main;
  }

  throw new Error('Project\'s package.json contains no "main" or "bin" fields.');
}


/**
 * Provided a base image name and a package.json object, computes a final image
 * name to use and then validates it.
 */
export function computeTag(tagFromOptions: string | undefined, packageJson: NormalizedPackageJson) {
  let result: string;

  const scope = packageJson.name.includes('/') ? packageJson.name.replace(/@/g, '').split('/')[0] : '';
  const name = packageJson.name.split('/').slice(-1)[0];
  const version = packageJson.version;

  if (!tagFromOptions) {
    result = `${scope ? `${scope}/` : ''}${name}:${version}`;
  } else {
    result = tagFromOptions;
    result = result.replace('{{packageName}}', name);
    result = result.replace('{{packageScope}}', scope);
    result = result.replace('{{packageVersion}}', version);
  }

  if (!DOCKER_IMAGE_PATTERN.test(result)) {
    throw new Error(`Invalid image name: ${result}`);
  }

  return result;
}


export interface RenderTemplateOptions {
  template: string;
  dest: string;
  data: any;
}

/**
 * Provided a path to an EJS template and a data object, returns a string
 * representing the rendered template.
 */
export async function renderTemplate({template, dest, data}: RenderTemplateOptions) {
  const templateContents = await fs.readFile(template, {encoding: 'utf8'});
  const renderedTemplate = ejs.render(templateContents, data);
  await fs.writeFile(dest, renderedTemplate);
}


/**
 * Provided a package's root directory and a target directory, packs the package
 * using `npm pack`, thereby collecting all relevant files needed for
 * production, then extracts the resulting tarball to the target directory.
 */
export async function packAndExtractPackage(npm: ThenArg<ReturnType<typeof chex>>, pkgRoot: string, destDir: string) {
  // Use `npm pack` to create a tarball of all files that would normally be
  // included when publishing the package.
  const tarballName = (await npm(['pack'], {cwd: pkgRoot})).stdout.split(/\r\n|\r|\n/).pop();

  const tarballPath = path.resolve(pkgRoot, tarballName ?? '');

  // Extract the NPM tarball to the staging area. By default, this will create a
  // subdirectory there named 'package' containing the tarball contents.
  await tar.extract({file: tarballPath, cwd: destDir});

  // Delete the tarball now that we have copied relevant files to the staging
  // area.
  await fs.remove(tarballPath);
}


/**
 * Provided a package's root directory and a target directory, determines if the
 * package has a 'package-lock.json' and, if so, copies it to the target
 * directory.
 *
 * Returns true if the a lockfile was copied and false otherwise.
 */
export async function copyPackageLockfile(pkgRoot: string, destDir: string) {
  try {
    await fs.access(path.join(pkgRoot, 'package-lock.json'));
    await fs.copy(path.join(pkgRoot, 'package-lock.json'), path.join(destDir, 'package-lock.json'));
    return true;
  } catch  {
    return false;
  }
}


/**
 * Provided an `npmrc` option from the Dockerize function, finds the appropriate
 * .npmrc file and copies it to the indicated destination directory.
 */
export async function copyNpmrc(npmrcOption: string | undefined, destDir: string) {
  const npmrcPath = npmrcOption === 'true' ? await findUp('.npmrc') : npmrcOption;

  if (npmrcPath) {
    await fs.copyFile(npmrcPath, path.join(destDir, '.npmrc'));
    return true;
  }

  return false;
}


/**
 * Provided a Docker image name, returns its size.
 */
export async function getImageSize(docker: ThenArg<ReturnType<typeof chex>>, imageName: string) {
  const results = await docker(['inspect', imageName]);
  return bytes(JSON.parse(results.stdout)[0].Size);
}


/**
 * Returns the current LTS version of NodeJS.
 */
export async function getNodeLtsVersion() {
  const versions = await nodeVersons();
  return versions.lts.version.full;
}
