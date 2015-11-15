'use strict'
// Note: 'use babel' doesn't work in forked processes
process.title = 'linter-eslint helper'

const CP = require('childprocess-promise')
const ChildProcess = require('child_process')
const Path = require('path')
const FS = require('fs')

const Communication = new CP()

let eslintPath = null
let eslintPathLocal = Path.join(FS.realpathSync(Path.join(__dirname, '..')), 'node_modules', 'eslint')
let eslint = null
let prefixPath = null

function find(startDir, name) {
  let filePath
  const chunks = startDir.split(Path.sep)
  while (chunks.length) {
    filePath = Path.join(chunks.join(Path.sep), name)
    try {
      FS.accessSync(filePath, FS.R_OK)
      return filePath
    } catch (_) { }
    chunks.pop()
  }
  return null
}

Communication.on('JOB', function(job) {
  const params = job.Message
  global.__LINTER_RESPONSE = []

  if (params.canDisable) {
    const configFile = find(params.fileDir, '.eslintrc')
    if (configFile === null) {
      job.Response = []
      return
    }
  }

  let modulesPath = find(params.fileDir, 'node_modules')
  let eslintNewPath = null
  if (modulesPath) {
    process.env.NODE_PATH = modulesPath
  } else process.env.NODE_PATH = ''
  require('module').Module._initPaths()

  process.chdir(params.fileDir)

  if (params.global) {
    if (prefixPath === null) {
      const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
      prefixPath = ChildProcess.spawnSync(npmCommand, ['get', 'prefix']).output[1].toString().trim()
    }
    if (process.platform === 'win32') {
      eslintNewPath = Path.join(prefixPath, 'node_modules', 'eslint')
    } else {
      eslintNewPath = Path.join(prefixPath, 'lib', 'node_modules', 'eslint')
    }
  } else {
    try {
      FS.accessSync(eslintNewPath = Path.join(modulesPath, 'eslint'), FS.R_OK)
    } catch (_) {
      eslintNewPath = eslintPathLocal
    }
  }

  if (eslintNewPath !== eslintPath) {
    try {
      eslint = require(Path.join(eslintNewPath, 'lib', 'cli.js'))
      eslintPath = eslintNewPath
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        throw new Error('ESLint not found, Please install or make sure Atom is getting $PATH correctly')
      } else throw e
    }
  }

  job.Response = new Promise(function(resolve) {
    process.argv = [
      process.execPath,
      eslintPath,
      '--stdin',
      '--format',
      Path.join(__dirname, 'reporter.js'),
      params.filePath
    ]
    eslint.execute(process.argv, params.contents)
    resolve(global.__LINTER_RESPONSE)
  })
})

process.exit = function() { /* Stop eslint from closing the daemon */ }