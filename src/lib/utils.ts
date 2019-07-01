import path from 'path';

import nodeVersons from '@darkobits/node-versions';
import bytes from 'bytes';
import ejs from 'ejs';
import execa from 'execa';
import findUp from 'find-up';
import fs from 'fs-extra';
import {NormalizedPackageJson} from 'read-pkg-up';
import tar from 'tar';


/**
 * If the provided value is an array, it is returned as-is. Otherwise, the value
 * is wrapped in an array and returned.
 */
export function ensureArray<T>(value: T): Array<T> {
  if (!value) {
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
export async function packAndExtractPackage(pkgRoot: string, destDir: string) {
  // Use `npm pack` to create a tarball of all files that would normally be
  // included when publishing the package.
  const tarballName = (await execa('npm', ['pack', '--ignore-scripts'], {cwd: pkgRoot})).stdout;

  // Extract the NPM tarball to the staging area. By default, this will create a
  // subdirectory there named 'package' containing the tarball contents.
  await tar.extract({file: tarballName, cwd: destDir});

  // Delete the tarball now that we have copied relevant files to the staging
  // area.
  await fs.remove(tarballName);
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
  } catch (err) {
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
 * Provided an image name, returns its size.
 */
export async function getImageSize(imageName: string) {
  const results = await execa('docker', ['inspect', imageName]);
  return bytes(JSON.parse(results.stdout)[0].Size);
}


/**
 * Returns the current LTS version of NodeJS.
 */
export async function getNodeLtsVersion() {
  const versions = await nodeVersons();
  return versions.lts.version.full;
}
