/**
 * Object Wrapper, very unsexy but needed.
 **/

#ifndef BUILDING_NODE_EXTENSION
#define BUILDING_NODE_EXTENSION
#endif

#ifndef NODE_LIBLZMA_H
# define NODE_LIBLZMA_H

#include <node.h>
#include <v8.h>
#include <node_buffer.h>
#include <node_object_wrap.h>

#include <sstream>

#ifdef LIBLZMA_ENABLE_MT
# warning "Building with (unstable) multithread support"
# define LZMA_UNSTABLE
#endif
#include <lzma.h>

#define STREAM_ENCODE 0
#define STREAM_DECODE 1
#define STREAM_ENCODE_MT 2

#define CONST_UINT32(target, value) \
  target->Set(String::NewSymbol(#value), Uint32::New(value), \
      static_cast<PropertyAttribute>(ReadOnly|DontDelete));

#ifndef ARRAY_SIZE
# define ARRAY_SIZE(a) (sizeof(a) / sizeof((a)[0]))
#endif

class LZMA : public node::ObjectWrap {
public:
  static void Init(v8::Handle<v8::Object> exports);

private:
  explicit LZMA() : node::ObjectWrap(), _stream(LZMA_STREAM_INIT),
    _wip(false), _pending_close(false), _refs(0)
  {
  }
  ~LZMA() {
    Close();
  }

  void Close();

  static v8::Handle<v8::Value> New(const v8::Arguments& args);
  static v8::Handle<v8::Value> Close(const v8::Arguments& args);

  template<bool async>
  static v8::Handle<v8::Value> Code(const v8::Arguments& args);

private:
  void Ref() {
    if (++this->_refs == 1) {
      handle_.ClearWeak();
    }
  }

  void Unref() {
    assert(this->_refs > 0);
    if (--this->_refs == 0) {
      MakeWeak();
    }
  }
  static void Process(uv_work_t* work_req);
  static void After(uv_work_t* work_req, int status);
  static v8::Handle<v8::Value> AfterSync(LZMA* obj);

  static v8::Persistent<v8::Function> constructor;

  uv_work_t _req;

  lzma_stream _stream;
  bool _wip;
  bool _pending_close;
  unsigned int _refs;

  lzma_action _action;
  v8::Persistent<v8::Function> _callback;
  lzma_ret _ret;

};

#endif // NODE_LIBLZMA_H
