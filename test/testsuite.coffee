expect = require "expect.js"
fs = require "fs"
stream = require "stream"
Q = require "q"

xzStream = require "../lib/XzStream"

helpers = require "./helpers"

describe 'Xz', ->
  describe 'should compress and decompress a string', ->
    it 'in sync mode, using #xzSync and #unxzSync', (next) ->
      input = helpers.random 256
      output = null
      expect(->
        output = xzStream.xzSync input
      ).to.not.throwException()
      expect(output).to.be.ok()
      original = null
      expect(->
        original = xzStream.unxzSync output
      ).to.not.throwException()
      expect(original).to.be.a Buffer
      expect(original.toString()).to.be input
      next()

    it 'in async mode, using #xz and #unxz', (next) ->
      buffer = helpers.random 256
      xzStream.xz buffer, (err,res) ->
        expect(err).to.not.be.ok()
        xzStream.unxz res, (err,res) ->
          expect(err).to.not.be.ok()
          expect(res).to.be.a Buffer
          expect(res.toString()).to.be buffer
          next()

  describe 'should compress a binary file (jpg)', ->
    it 'in sync mode', (next) ->
      input = fs.readFileSync "test/data/HollywoodSign.jpg"
      output = null
      expect(->
        output = xzStream.xzSync input
      ).to.not.throwException()
      expect(output && output.length).to.be 610980
      next()

    it 'in async mode', (next) ->
      xz = new xzStream.Xz()
      input = fs.createReadStream "test/data/HollywoodSign.jpg"

      compressor = input.pipe xz
      xz.on 'data', ->
      xz.on 'end', next

  describe 'should compress and output', ->
    it 'in async mode', (next) ->
      xz = new xzStream.Xz()
      input = fs.createReadStream "test/data/HollywoodSign.jpg"
      output = fs.createWriteStream "test/data/HollywoodSign.jpg.xz"

      output.on 'finish', ->
        msg = helpers.checkOutputFile "test/data/HollywoodSign.jpg.xz", 610980
        next msg
        return

      input
      .pipe xz
      .pipe output

    it 'in threaded mode', (next) ->
      if xzStream.hasThreads()
        console.log "liblzma built with threads support."
        expectedSize = 610988
      else
        expectedSize = 610980
        console.log "liblzma was built without thread support."

      xz = new xzStream.Xz threads: 0
      input = fs.createReadStream "test/data/HollywoodSign.jpg"
      output = fs.createWriteStream "test/data/HollywoodSign.jpg.xz"

      output.on 'finish', ->
        msg = helpers.checkOutputFile "test/data/HollywoodSign.jpg.xz", expectedSize
        next msg
        return

      input
      .pipe xz
      .pipe output


describe 'UnXZ', ->
  describe 'should decompress', ->
    it 'in sync mode', (next) ->
      input = fs.readFileSync "test/data/HollywoodSign.jpg.xz"
      output = null
      expect(->
        output = xzStream.unxzSync input
      ).to.not.throwException()
      expect(output && output.length).to.be 616193
      next()

    it 'in async mode', (next) ->
      unxz = new xzStream.Unxz()
      input = fs.createReadStream "test/data/HollywoodSign.jpg.xz"

      decompressor = input.pipe unxz
      unxz.on 'data', ->
      unxz.on 'end', next

  describe 'should decompress and output', ->
    it 'in async mode', (next) ->
      unxz = new xzStream.Unxz()
      input = fs.createReadStream "test/data/HollywoodSign.jpg.xz.orig"
      output = fs.createWriteStream "test/data/HollywoodSign.jpg.unxz"

      output.on 'finish', ->
        msg = helpers.checkOutputFile "test/data/HollywoodSign.jpg.unxz", 616193
        next msg
        return

      input
      .pipe unxz
      .pipe output

  describe 'should accept LZMA_FILTER_X86 with generated node addon', ->
    it 'in sync mode, using #xzSync and #unxzSync', (next) ->
      input = fs.readFileSync 'build/Release/node-liblzma.node'
      output = null
      expect(->
        output = xzStream.xzSync input, filters: [xzStream.filter.X86]
      ).to.not.throwException()
      expect(output).to.be.ok()
      original = null
      expect(->
        original = xzStream.unxzSync output, filters: [xzStream.filter.X86]
      ).to.not.throwException()
      expect(original).to.be.a Buffer
      if helpers.bufferEqual original, input
        next()
      else
        next "Uncompressed different from original!"

    it 'in async mode using promises, and compare output sizes', (next) ->
      buffer = fs.readFileSync 'build/Release/node-liblzma.node'

      # Using Q to wait on async operations
      promises = [
        new Q.Promise (resolve) ->
          xzStream.xz buffer, (err,res) ->
            expect(err).to.not.be.ok()
            resolve res.length
        new Q.Promise (resolve) ->
          xzStream.xz buffer, filters: [xzStream.filter.X86], (err,res) ->
            expect(err).to.not.be.ok()
            resolve res.length
      ]

      Q.all promises
      .then (results) ->
        console.info "Compressed size with X86 filter: #{results[1]}"
        console.info "Compressed size without X86 filter: #{results[0]}"
        next()

  after ->
    # We completed our task, remove created files
    fs.unlinkSync "test/data/HollywoodSign.jpg.xz"
    fs.unlinkSync "test/data/HollywoodSign.jpg.unxz"
