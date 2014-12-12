expect = require "expect.js"
fs = require "fs"

{Unxz, Xz, filter} = require "../lib/XzStream"

describe 'Xz Compressor options', ->
  it 'should only allow Array filters', ->
    expect(->
      xzStream = new Xz filters: filter.LZMA2
    ).to.throwException (e) ->
      expect(e).to.eql {"name":"AssertionError","actual":false,"expected":true,"operator":"==","message":"Filters need to be in an array!"}

  it 'should throw error if more than LZMA_MAX_FILTERS set', (done) ->
    expect(->
      xzStream = new Xz filters: [
        filter.LZMA2
        filter.X86
        filter.IA64
        filter.ARM
      ]
    ).to.throwException (e) ->
      expect(e).to.be "More filters than allowed maximum"

    done()
