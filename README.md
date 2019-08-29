<a href="#top" id="top">
  <img src="https://user-images.githubusercontent.com/441546/57589163-d5c72e00-74d4-11e9-9007-5fece7c67509.png" style="max-width: 100%;">
</a>
<p align="center">
  <a href="https://www.npmjs.com/package/@darkobits/dockerize"><img src="https://img.shields.io/npm/v/@darkobits/dockerize.svg?style=flat-square"></a>
  <a href="https://github.com/darkobits/log/actions"><img src="https://img.shields.io/endpoint?url=https://aws.frontlawn.net/ga-shields/darkobits/log&style=flat-square"></a>
  <a href="https://david-dm.org/darkobits/dockerize"><img src="https://img.shields.io/david/darkobits/dockerize.svg?style=flat-square"></a>
  <a href="https://conventionalcommits.org"><img src="https://img.shields.io/badge/conventional%20commits-1.0.0-FB5E85.svg?style=flat-square"></a>
</p>

This package aims to make Dockerizing a Node project as straightforward as using `npm publish`. It leverages `npm pack` (used internally by `npm publish`) to determine which files are production-relevant and existing standards for determining a project's entrypoint, namely the `"main"` and `"bin"` `package.json` fields.

## Install

Dockerize may be installed globally, though it is recommended that it be installed as a development dependency of an existing project.

```
npm i --dev @darkobits/dockerize
```

## Use

Dockerize uses a project's `package.json` to infer which files should be included in images and which file to use as the image's entrypoint. By default, it will use the first (or only) `"bin"` value, if present. Otherwise, it will use `"main"`. All files enumerated in `"files"` will be included in the image.

### Example

Let's imagine we are developing a web server that we want to Dockerize. We're using Babel to transpile our source files to a `dist` folder in our project root. This project's `package.json` (sans dependencies) may look like the following:

```json
{
  "name": "web-server-demo",
  "version": "0.1.0",
  "files": [
    "dist"
  ],
  "main": "dist/server.js",
  "scripts": {
    "dockerize": "dockerize"
  }
}
```

To Dockerize this project, we can run `npm run dockerize`, which will invoke the Dockerize CLI via the above package script.

This will produce a Docker image with the tag `web-server-demo:0.1.0` using the current LTS version of Node. To start our containerized web server, we can run:

```
docker run -it web-server-demo:0.1.0
```

For a full list of CLI options, see `dockerize --help`.

### Node API

Dockerize can also be used programatically. This package's default export is a function that accepts a single options object. For a complete list of options, see [`types.ts`](/src/etc/types.ts).

## Images

Images produced using Dockerize's default Dockerfile have the following attributes:

* Based on the [Ubuntu 19.04 image](https://hub.docker.com/_/ubuntu), which is "minimal" by default, and therefore relatively small.
* Dockerize will install the [current LTS version of Node](https://github.com/darkobits/node-versions) at build time.
* [Tini](https://github.com/krallin/tini) is used as a minimalistic process manager to ensure proper POSIX signal handling.

## &nbsp;
<p align="center">
  <br>
  <img width="24" height="24" src="https://cloud.githubusercontent.com/assets/441546/25318539/db2f4cf2-2845-11e7-8e10-ef97d91cd538.png">
</p>
