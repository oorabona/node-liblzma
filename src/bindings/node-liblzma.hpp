/**
 * node-liblzma - Node.js bindings for liblzma
 * Copyright (C) 2014-2015 Olivier Orabona <olivier.orabona@gmail.com>
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
 **/

#ifndef BUILDING_NODE_EXTENSION
#define BUILDING_NODE_EXTENSION
#endif

#ifndef NODE_LIBLZMA_H
# define NODE_LIBLZMA_H

#include <node.h>
#include <node_object_wrap.h>
#include <v8.h>
#include <nan.h>

using v8::Array;
using v8::Context;
using v8::Function;
using v8::FunctionTemplate;
using v8::Handle;
using v8::Local;
using v8::Object;
using v8::Persistent;
using v8::String;
using v8::Value;

#include <sstream>

#ifdef LIBLZMA_ENABLE_MT
# warning "Building with (unstable) multithread support"
# define LZMA_UNSTABLE
#endif
#include <lzma.h>

#define STREAM_ENCODE 0
#define STREAM_DECODE 1
#define STREAM_ENCODE_MT 2
#define STREAM_ENCODE_RAW 3
#define STREAM_DECODE_RAW 4

#define CONST_UINT32(target, value) \
  target->Set(String::NewSymbol(#value), Uint32::New(value), \
      static_cast<PropertyAttribute>(ReadOnly|DontDelete));

#ifndef ARRAY_SIZE
# define ARRAY_SIZE(a) (sizeof(a) / sizeof((a)[0]))
#endif

/**
 * Create a new v8 String
 */
template<typename T>
inline Local<String> NewString(T value) {
  return Nan::New<String>(value).ToLocalChecked();
}

class LZMA : public Nan::ObjectWrap {
public:
  static void Init(Local<Object> exports);

private:
  explicit LZMA() : ObjectWrap(), _stream(LZMA_STREAM_INIT),
    _wip(false), _pending_close(false)
  {
  }
  ~LZMA() {
    Nan::AdjustExternalMemory(-int64_t(sizeof(LZMA)));
    Close();
  }

  void Close();

  static NAN_METHOD(New);
  static NAN_METHOD(Close);

  template<bool async>
  static NAN_METHOD(Code);

private:
  static void Process(uv_work_t* work_req);
  static void After(uv_work_t* work_req, int status);
  static Local<Value> AfterSync(LZMA* obj);

  static Nan::Persistent<Function> constructor;

  static void _failMissingSelf(const Nan::FunctionCallbackInfo<Value>& info) {
  	Nan::ThrowTypeError("LZMA methods need to be called on an LZMA object");
  	info.GetReturnValue().SetUndefined();
  }

  uv_work_t _req;

  lzma_stream _stream;
  bool _wip;
  bool _pending_close;

  lzma_action _action;
  Nan::Callback _callback;
  lzma_ret _ret;
};

#endif // NODE_LIBLZMA_H
