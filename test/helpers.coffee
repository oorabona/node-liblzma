# Tests helper functions
crypto = require "crypto"
fs = require "fs"

exports.random = (howMany, chars) ->
  chars = chars or "abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUWXYZ0123456789"
  rnd = crypto.randomBytes(howMany)
  value = new Array(howMany)
  len = chars.length
  i = 0

  while i < howMany
    value[i] = chars[rnd[i] % len]
    i++
  value.join ""

exports.checkOutputFile = (file, size) ->
  stat = fs.statSync file
  msg = if stat.size is size then null else "Size is different: #{stat.size}"

exports.bufferEqual = (a, b) ->
  return false  unless a.length is b.length
  i = 0

  while i < a.length
    return false  unless a[i] is b[i]
    ++i
  true

module.exports = exports
