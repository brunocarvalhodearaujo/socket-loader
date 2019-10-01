/**
 * Copyright (c) 2019-present, Bruno Carvalho de Araujo.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

const fs = require('fs')
const path = require('path')
const console = require('console')

/**
 * @typedef Options
 * @property {string|RegExp} [cwd]
 * @property {boolean} [verbose]
 * @property {console} [logger]
 * @property {string[]} [extensions]
 * @property {boolean} [withNamespace]
 */

class Loader {
  /**
   * @type {any[]}
   */
  extraArguments = []
  /**
   * @type {string[]}
   */
  files = []

  /**
   * @param {Options} [options]
   */
  constructor (options = {}) {
    this.options = {
      cwd: process.cwd(),
      verbose: false,
      logger: console,
      extensions: ['js', 'mjs'],
      withNamespace: true,
      ...options
    }
  }

  /**
   * Log handler.
   *
   * @param {string|string[]} message
   * @param {'info' | 'warn' | 'error' | 'log'} [type]
   */
  log (message, type = 'info') {
    if (this.options.verbose) {
      this.options.logger[type](message)
    }

    return this
  }

  /**
   * @param {string} dirname
   * @returns {this}
   */
  when (dirname) {
    const location = path.join(this.options.cwd, dirname)

    if (!fs.existsSync(location)) {
      this.log(`Entity not found ${location}`, 'error')
      return this
    }

    if (!fs.statSync(location).isDirectory()) {
      this.log(`${location} not is an folder`, 'error')
      return this
    }

    for (const filename of fs.readdirSync(location)) {
      const [extension] = /[^.]+$/.exec(filename)

      if (!this.options.extensions.includes(extension)) {
        this.log(`Ignoring extension: ${extension}`)
        continue
      }

      if (filename.charAt(0) === '.') {
        this.log(`Ignoring hidden entity: ${filename}`)
        continue
      }

      this.files.push(path.join(location, filename))
    }

    return this
  }

  /**
   * Get relative to location.
   *
   * @param {string} location
   * @returns {string[]}
   */
  getRelativeTo (location) {
    return '.' + location.split(this.options.cwd).pop()
  }

  /**
   * @param {string} name
   */
  getKeyName (name) {
    return path.basename(name, path.extname(name))
  }

  /**
   * load an argument with loader
   *
   * @param {...any} extraArgument
   */
  withExtraArgument (...extraArgument) {
    this.extraArguments = this.extraArguments.concat(extraArgument)

    return this
  }

  /**
   * Into method
   *
   * @param {import('socket.io').Server} server
   * @returns {this}
   */
  into (server) {
    /**
     * @type {Function[]}
     */
    let fns = []

    for (const file of this.files) {
      const parts = this.getRelativeTo(file)
        .split(path.sep)
        .slice(1)

      try {
        const T = require(file)
        var mod = Object.keys(T).map(e => T[e])
      } catch (error) {
        throw new Error(`Failed to require ${file} because: ${error.message}`)
      }

      for (const i of mod) {
        if (typeof i !== 'function') {
          throw new Error('module requires an function')
        }

        if (/^\s*class\s+/.test(i.toString())) {
          const instance = new (mod[mod.indexOf(i)])() // eslint-disable-line

          if ('connection' in instance) {
            mod[mod.indexOf(i)] = instance.connection.bind(instance)
          } else {
            this.log('cannot load route', 'error')
          }
        }

        this.log(`loaded: ${parts[parts.length - 1]}`)

        fns = fns.concat(mod)
      }
    }

    server.on('connection', socket => {
      for (const fn of fns) {
        fn(server, socket, ...this.extraArguments)
      }
    })

    return this
  }
}

/**
 * @param {Options} [options]
 * @returns {Loader}
 */
module.exports = (options = {}) => new Loader(options)
