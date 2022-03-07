expect = require "expect.js"
fs = require "fs"

{ Unxz, Xz, filter } = require "../lib/lzma"

describe 'Xz Compressor options', ->
  it 'should only allow Array filters', ->
    expect(->
      xzStream = new Xz { filters: filter.LZMA2 }
    ).to.throwException (e) ->
      expect(e.message).to.eql "Filters need to be in an array!"

  it 'should throw error if more than LZMA_MAX_FILTERS set', (done) ->
    expect(->
      xzStream = new Xz { filters: [
        # filter.LZMA2 (should be automagically added anyway)
        filter.X86
        filter.IA64
        filter.ARM
      ] }
    ).to.throwException (e) ->
      expect(e).to.be.a RangeError

    done()
