###
 * node-liblzma - Node.js bindings for liblzma
 * Copyright (C) Olivier Orabona <olivier.orabona@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
###

path = require 'path'
binding_path = path.resolve path.join __dirname, '..'

liblzma = require('node-gyp-build')(binding_path)
util = require 'util'
assert = require 'assert'
os = require 'os'
{ Transform } = require 'stream'

# Should not change over time... :)
maxThreads = os.cpus().length

class XzStream extends Transform
  constructor: (mode, @_opts = {}, options) ->
    super options

    @_opts.check ?= exports.check.NONE
    @_opts.preset ?= exports.preset.DEFAULT
    @_opts.filters ?= [exports.filter.LZMA2]
    @_opts.mode ?= exports.mode.NORMAL
    @_opts.threads ?= 1

    @_chunkSize = if @_opts.chunkSize then @_opts.chunkSize else liblzma.BUFSIZ

    # By default no flush, since there is no LZMA_NO_SYNC, we stick to
    # default LZMA_RUN (0)
    @_flushFlag = @_opts.flushFlag or liblzma.LZMA_RUN

    assert Array.isArray(@_opts.filters), "Filters need to be in an array!"

    # Add default filter LZMA2 if none provided
    if @_opts.filters.indexOf(exports.filter.LZMA2) is -1
      @_opts.filters.push exports.filter.LZMA2

    # Multithreading is only available for encoding, so if we are encoding, check
    # opts threads value.
    if mode is liblzma.STREAM_ENCODE
      @_opts.threads = 1 unless liblzma.HAS_THREADS_SUPPORT

      # By default set to maximum available processors
      if @_opts.threads is 0
        @_opts.threads = maxThreads

    # Initialize engine
    @lzma = new liblzma.LZMA mode, @_opts
    @_closed = false
    @_hadError = false
    @_offset = 0
    @_buffer = Buffer.alloc @_chunkSize

    @on 'onerror', (errno) =>
      @_hadError = true
      error = new Error exports.messages[errno]
      error.errno = errno
      error.code = errno

      @emit 'error', error

    @once 'end', @close

  flush: (kind, callback) ->
    ws = @_writableState

    if (typeof kind == 'function' or (typeof kind == 'undefined' && !callback))
      [callback, kind] = [kind, liblzma.LZMA_SYNC_FLUSH]

    if ws.ended
      if callback
        process.nextTick callback
    else if ws.ending
      if callback
        @once 'end', callback
    else if ws.needDrain
      @once 'drain', =>
        @flush callback
        return
    else
      @_flushFlag = kind
      @write Buffer.alloc(0), '', callback

    return

  close: (callback) ->
    if callback
      process.nextTick callback

    # We will trigger this case with #xz and #unxz
    return if @_closed

    @lzma.close()
    @_closed = true

    process.nextTick =>
      @emit 'close'
      return

    return

  _transform: (chunk, encoding, callback) ->
    flushFlag = undefined
    ws = @_writableState
    ending = ws.ending or ws.ended
    last = ending and (not chunk or ws.length is chunk.length)
    return callback(new Error("invalid input")) if chunk != null and !(chunk instanceof Buffer)
    return callback(new Error("lzma binding closed")) if @_closed

    # If it's the last chunk, or a final flush, we use the LZMA_FINISH flush flag.
    # If it's explicitly flushing at some other time, then we use
    # LZMA_SYNC_FLUSH.
    if last
      flushFlag = liblzma.LZMA_FINISH
    else
      flushFlag = @_flushFlag

      # once we've flushed the last of the queue, stop flushing and
      # go back to the normal behavior.
      @_flushFlag = @_opts.flushFlag or liblzma.LZMA_RUN if chunk.length >= ws.length

    @_processChunk chunk, flushFlag, callback
    return

  _flush: (callback) ->
    @_transform Buffer.alloc(0), '', callback
    return

  _processChunk: (chunk, flushFlag, cb) ->
    # If user setting async is set to true, then it will all depend on whether
    # we can actually be async, or not. If user set explicitly async to false
    # then whether we have a callback or not becomes irrelevant..
    # TODO: Works in v0.11
    #async = util.isFunction cb
    # until then...
    async = typeof cb == 'function'

    # Sanity checks
    assert !@_closed, "Stream closed!"

    availInBefore = chunk && chunk.length
    availOutBefore = @_chunkSize - @_offset
    inOff = 0

    # So far it looks like Zlib _processChunk in CoffeeScript. But to make C++
    # code easier when it comes to emitting events and callback calling sync/async
    # we handle error codes here. If anything wrong is returned, we emit event
    # and return false in case we are synchronous.
    callback = (errno, availInAfter, availOutAfter) =>
      return if @_hadError

      # if LZMA engine returned something else, we are running into trouble!
      if errno isnt liblzma.LZMA_OK and errno isnt liblzma.LZMA_STREAM_END
        @emit 'onerror', errno
        return false

      used = availOutBefore - availOutAfter
      assert used >= 0, "More bytes after than before! Delta = #{used}"

      if used > 0
        out = @_buffer[ @_offset ... @_offset + used ]
        @_offset += used
        if async
          @push out
        else
          buffers.push out
          nread += used

      # exhausted the output buffer, or used all the input create a new one.
      if availOutAfter is 0 or @_offset >= @_chunkSize
        availOutBefore = @_chunkSize
        @_offset = 0
        @_buffer = Buffer.alloc @_chunkSize

      if availOutAfter is 0 or availInAfter > 0
        inOff += (availInBefore - availInAfter)
        availInBefore = availInAfter

        return true unless async
        @lzma.code flushFlag, chunk, inOff, availInBefore, @_buffer, @_offset, callback
        return

      return false unless async
      cb()
      return

    unless async
      # Doing it synchronously
      buffers = []
      nread = 0

      error = null
      @on 'error', (e) -> error = e

      loop
        res = @lzma.codeSync flushFlag, chunk, inOff, availInBefore, @_buffer, @_offset
        break unless not @_hadError and callback res[0], res[1], res[2]

      throw error if @_hadError
      @close()

      buf = Buffer.concat buffers, nread
      return buf

    @lzma.code flushFlag, chunk, inOff, availInBefore, @_buffer, @_offset, callback

    return

class Xz extends XzStream
  constructor: (lzma_options, options) ->
    super liblzma.STREAM_ENCODE, lzma_options, options

class Unxz extends XzStream
  constructor: (lzma_options, options) ->
    super liblzma.STREAM_DECODE, lzma_options, options


exports.Xz = Xz
exports.Unxz = Unxz

exports.hasThreads = ->
  liblzma.HAS_THREADS_SUPPORT

exports.messages = [
  "Operation completed successfully"
  "End of stream was reached"
  "Input stream has no integrity check"
  "Cannot calculate the integrity check"
  "Integrity check type is not available"
  "Cannot allocate memory"
  "Memory usage limit was reached"
  "File format not recognized"
  "Invalid or unsupported options"
  "Data is corrupt"
  "No progress is possible"
  "Programming error"
]

exports.check = {
  "NONE": liblzma.LZMA_CHECK_NONE
  "CRC32": liblzma.LZMA_CHECK_CRC32
  "CRC64": liblzma.LZMA_CHECK_CRC64
  "SHA256": liblzma.LZMA_CHECK_SHA256
}

exports.preset = {
  "DEFAULT": liblzma.LZMA_PRESET_DEFAULT
  "EXTREME": liblzma.LZMA_PRESET_EXTREME
}

exports.flag = {
  "TELL_NO_CHECK": liblzma.LZMA_TELL_NO_CHECK
  "TELL_UNSUPPORTED_CHECK": liblzma.LZMA_TELL_UNSUPPORTED_CHECK
  "TELL_ANY_CHECK": liblzma.LZMA_TELL_ANY_CHECK
  "CONCATENATED": liblzma.LZMA_CONCATENATED
}

exports.filter = {
  "LZMA2": liblzma.LZMA_FILTER_LZMA2
  "X86": liblzma.LZMA_FILTER_X86
  "POWERPC": liblzma.LZMA_FILTER_POWERPC
  "IA64": liblzma.LZMA_FILTER_IA64
  "ARM": liblzma.LZMA_FILTER_ARM
  "ARMTHUMB": liblzma.LZMA_FILTER_ARMTHUMB
  "SPARC": liblzma.LZMA_FILTER_SPARC
}

exports.mode = {
  "FAST": liblzma.LZMA_MODE_FAST
  "NORMAL": liblzma.LZMA_MODE_NORMAL
}

exports.createXz = (lzma_options, options) ->
  new Xz(lzma_options, options)

exports.createUnxz = (lzma_options, options) ->
  new Unxz(lzma_options, options)

exports.unxz = (buffer, opts, callback) ->
  if typeof opts == 'function'
    [callback, opts] = [opts, {}]

  xzBuffer new Unxz(opts), buffer, callback

exports.unxzSync = (buffer, opts) ->
  xzBufferSync new Unxz(opts), buffer

exports.xz = (buffer, opts, callback) ->
  if typeof opts == 'function'
    [callback, opts] = [opts, {}]
  xzBuffer new Xz(opts), buffer, callback

exports.xzSync = (buffer, opts) ->
  xzBufferSync new Xz(opts), buffer

xzBuffer = (engine, buffer, callback) ->
  buffers = []
  nread = 0
  flow = ->
    chunk = undefined
    while null isnt (chunk = engine.read())
      buffers.push chunk
      nread += chunk.length
    engine.once 'readable', flow
    return
  onEnd = ->
    buf = Buffer.concat(buffers, nread)
    buffers = []
    callback null, buf
    engine.close()
    return
  onError = (err) ->
    engine.removeListener 'end', onEnd
    engine.removeListener 'readable', flow
    callback err
    return
  engine.on 'error', onError
  engine.on 'end', onEnd
  engine.end buffer
  flow()
  return

xzBufferSync = (engine, buffer) ->
  buffer = Buffer.from(buffer) if typeof buffer == 'string'
  throw new TypeError("Not a string or buffer") unless buffer instanceof Buffer

  engine._processChunk buffer, liblzma.LZMA_FINISH

module.exports = exports
