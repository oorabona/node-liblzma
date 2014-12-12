#include "node_libxz.h"

using namespace v8;

Persistent<Function> LZMA::constructor;

void LZMA::Close() {
  if(_wip) {
    _pending_close = true;
    return;
  }

  _pending_close = false;

  _callback.Dispose();
  _callback.Clear();

  lzma_end(&_stream);
}

void LZMA::Init(Handle<Object> exports) {
  // constructor template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  t->InstanceTemplate()->SetInternalFieldCount(1);
  t->SetClassName(String::NewSymbol("LZMA"));

  // prototype methods
  NODE_SET_PROTOTYPE_METHOD(t, "close", Close);
  NODE_SET_PROTOTYPE_METHOD(t, "code", Code<true>);
  NODE_SET_PROTOTYPE_METHOD(t, "codeSync", Code<false>);

  constructor = Persistent<Function>::New(t->GetFunction());
  exports->Set(String::NewSymbol("LZMA"), constructor);
}

Handle<Value> LZMA::New(const Arguments& args) {
  HandleScope scope;

  if (!args.IsConstructCall()) {
    // Invoked as plain function, turn into construct call.
    const int argc = 1;
    Local<Value> argv[argc] = { args[0] };
    return scope.Close(constructor->NewInstance(argc, argv));
  }

  if( args.Length() != 2 ) {
    ThrowException(Exception::TypeError(String::New("Wrong number of arguments, expected mode(int) and opts(object)")));
    return scope.Close(Undefined());
  }

  uint32_t mode = args[0]->Uint32Value();

  if (!args[1]->IsObject()) {
    ThrowException(Exception::TypeError(String::New("Expected object as second argument")));
    return scope.Close(Undefined());
  }

  Local<Object> opts = args[1]->ToObject();
  lzma_check check = static_cast<lzma_check>(opts->Get(String::New("check"))->Uint32Value());
  uint32_t preset = opts->Get(String::New("preset"))->Uint32Value();
  Local<Array> filters_handle = Array::Cast(*opts->Get(String::New("filters")));

  uint32_t filters_len = filters_handle->Length();

  // We will need to add LZMA_VLI_UNKNOWN after, so user defined filters may
  // not exceed LZMA_FILTERS_MAX - 1.
  if( filters_len > LZMA_FILTERS_MAX - 1) {
    ThrowException(String::New("More filters than allowed maximum"));
    return scope.Close(Undefined());
  }

  lzma_options_lzma opt_lzma2;
  if( lzma_lzma_preset(&opt_lzma2, preset) ) {
    ThrowException(String::New("Unsupported preset, possibly a bug"));
    return scope.Close(Undefined());
  }

  // Add extra slot for LZMA_VLI_UNKNOWN.
  lzma_filter filters[filters_len+1];

  for(uint32_t i = 0; i < filters_len; ++i) {
    uint64_t current = filters_handle->Get(Integer::New(i))->Uint32Value();
    filters[i].id = current;
    if( current == LZMA_FILTER_LZMA2 ) {
      filters[i].options = &opt_lzma2;
    } else {
      filters[i].options = NULL;
    }
  }

  filters[filters_len] = { .id = LZMA_VLI_UNKNOWN, .options = NULL };

  LZMA *obj;

  lzma_ret ret;
  switch(mode) {
    case STREAM_DECODE: {
      obj = new LZMA();
      ret = lzma_stream_decoder(&obj->_stream, UINT64_MAX, check);
      break;
    }
    case STREAM_ENCODE: {
      obj = new LZMA();
      ret = lzma_stream_encoder(&obj->_stream, filters, check);
      break;
    }
#ifdef LIBLZMA_ENABLE_MT
    case STREAM_ENCODE_MT: {
      unsigned int threads = opts->Get(String::New("threads"))->Uint32Value();
      obj = new LZMA();
      lzma_mt mt = {
        .flags = 0,
        .threads = threads,
        .block_size = 0,
        .timeout = 0,
        .preset = preset,
        .filters = filters,
        .check = check,
      };

      ret = lzma_stream_encoder_mt(&obj->_stream, &mt);
      break;
    }
#endif
    default:
      ret = LZMA_OPTIONS_ERROR;
  }
  if (ret != LZMA_OK) {
    return scope.Close(Integer::New(ret));
  }

  obj->Wrap(args.This());
  return args.This();
}

Handle<Value> LZMA::Close(const Arguments& args) {
  HandleScope scope;

  LZMA *obj = ObjectWrap::Unwrap<LZMA>(args.Holder());
  obj->Close();
  return scope.Close(Undefined());
}

/**<
 * \brief   Do the encoding/decoding with async support
 *
 * Function prototype is (sync):
 * .codeSync flushFlag, input_buffer, input_offset, output_buffer, output_offset, callback
 * Function prototype is (async):
 * .code flushFlag, input_buffer, input_offset, availInBefore, output_buffer, output_offset, callback
 *
 * Where:
 *  flushFlag: type: Uint32
 *  input_buffer: type: Buffer
 *  input_offset: type: Uint32
 *  availInBefore: type: Uint32
 *  output_buffer: type: Buffer
 *  output_offset: type: Uint32
 *  callback: type: Function
 */
template<bool async>
Handle<Value> LZMA::Code(const Arguments& args) {
  //Isolate *isolate = Isolate::GetCurrent();
  HandleScope scope;

  LZMA *obj = ObjectWrap::Unwrap<LZMA>(args.This());

  obj->_wip = true;
  obj->Ref();

  // Neat trick but that does the job :)
  if (args.Length() != 6+(int)async) {
    ThrowException(String::New("Requires all these arguments: "
      "flushFlag, input_buffer, input_offset, availInBefore, "
      "output_buffer, output_offset, [callback]"));
    return Undefined();
  }

  obj->_action = (lzma_action)args[0]->Uint32Value();

  // Evaluate parameters passed to us
  const uint8_t *in;
  uint8_t *out;
  size_t in_off, in_len, out_off, out_len;

  if (args[1]->IsNull()) {
    // just a flush
    uint8_t nada[1] = { 0 };
    in = nada;
    in_len = 0;
    in_off = 0;
  } else {
    if (!node::Buffer::HasInstance(args[1])) {
      ThrowException(Exception::TypeError(String::New("Argument must be a buffer")));
      return Undefined();
    }
    Local<Object> in_buf;
    in_buf = args[1]->ToObject();
    in_off = args[2]->Uint32Value();
    in_len = args[3]->Uint32Value();

    if(!node::Buffer::IsWithinBounds(in_off, in_len, node::Buffer::Length(in_buf))) {
      ThrowException(String::New("Offset out of bounds!"));
      return Undefined();
    }
    in = reinterpret_cast<const uint8_t *>(node::Buffer::Data(in_buf) + in_off);
  }

  Local<Object> out_buf = args[4]->ToObject();
  if( !node::Buffer::HasInstance(out_buf) ) {
    ThrowException(Exception::TypeError(String::New("Argument must be a buffer")));
    return Undefined();
  }

  out_off = args[5]->Uint32Value();
  out_len = node::Buffer::Length(out_buf) - out_off;
  out = reinterpret_cast<uint8_t *>(node::Buffer::Data(out_buf) + out_off);

  // Only if async mode is enabled we need a callback function
  if(async)
    obj->_callback = Persistent<Function>::New(args[6].As<Function>());

  obj->_stream.next_in = in;
  obj->_stream.avail_in = in_len;
  obj->_stream.next_out = out;
  obj->_stream.avail_out = out_len;

  obj->_req.data = obj;

  // do it synchronously
  if(!async) {
    Process(&(obj->_req));
    return scope.Close(AfterSync(obj));
  }

  // set a circular point so that we can get work_req structure data
  uv_queue_work(uv_default_loop(), &(obj->_req), LZMA::Process, LZMA::After);
  return scope.Close(Undefined());
}

void LZMA::Process(uv_work_t* work_req) {
  LZMA* obj = static_cast<LZMA*>(work_req->data);

  obj->_wip = true;
  obj->_ret = lzma_code(&(obj->_stream), obj->_action);
}

void LZMA::After(uv_work_t* work_req, int status) {
  HandleScope scope;
  LZMA* obj = static_cast<LZMA*>(work_req->data);

  Local<Integer> ret_code = Integer::New(obj->_ret);
  Local<Integer> avail_in = Integer::New(obj->_stream.avail_in);
  Local<Integer> avail_out = Integer::New(obj->_stream.avail_out);
  Handle<Value> argv[3] = { ret_code, avail_in, avail_out };

  obj->_wip = false;

  node::MakeCallback(Context::GetCurrent()->Global(),
                     obj->_callback,
                     ARRAY_SIZE(argv),
                     argv);

  obj->Unref();
  if(obj->_pending_close) {
    obj->Close();
  }
}

Handle<Value> LZMA::AfterSync(LZMA* obj) {
  //Isolate *isolate = Isolate::GetCurrent();
  HandleScope scope;

  Local<Integer> ret_code = Integer::New(obj->_ret);
  Local<Integer> avail_in = Integer::New(obj->_stream.avail_in);
  Local<Integer> avail_out = Integer::New(obj->_stream.avail_out);
  Local<Array> result = Array::New(3);
  result->Set(0, ret_code);
  result->Set(1, avail_in);
  result->Set(2, avail_out);

  obj->_wip = false;

  obj->Unref();
  if(obj->_pending_close) {
    obj->Close();
  }
  return scope.Close(result);
}

void init(Handle<Object> exports) {
  // Status codes
  NODE_DEFINE_CONSTANT(exports, LZMA_OK);
  NODE_DEFINE_CONSTANT(exports, LZMA_STREAM_END);
  NODE_DEFINE_CONSTANT(exports, LZMA_NO_CHECK);
  NODE_DEFINE_CONSTANT(exports, LZMA_UNSUPPORTED_CHECK);
  NODE_DEFINE_CONSTANT(exports, LZMA_GET_CHECK);
  NODE_DEFINE_CONSTANT(exports, LZMA_MEM_ERROR);
  NODE_DEFINE_CONSTANT(exports, LZMA_MEMLIMIT_ERROR);
  NODE_DEFINE_CONSTANT(exports, LZMA_FORMAT_ERROR);
  NODE_DEFINE_CONSTANT(exports, LZMA_OPTIONS_ERROR);
  NODE_DEFINE_CONSTANT(exports, LZMA_DATA_ERROR);
  NODE_DEFINE_CONSTANT(exports, LZMA_BUF_ERROR);
  NODE_DEFINE_CONSTANT(exports, LZMA_PROG_ERROR);

  // Check algorithms
  NODE_DEFINE_CONSTANT(exports, LZMA_CHECK_NONE);
  NODE_DEFINE_CONSTANT(exports, LZMA_CHECK_CRC32);
  NODE_DEFINE_CONSTANT(exports, LZMA_CHECK_CRC64);
  NODE_DEFINE_CONSTANT(exports, LZMA_CHECK_SHA256);

  // Presets
  NODE_DEFINE_CONSTANT(exports, LZMA_PRESET_DEFAULT);
  NODE_DEFINE_CONSTANT(exports, LZMA_PRESET_EXTREME);

  // Flags
  NODE_DEFINE_CONSTANT(exports, LZMA_TELL_NO_CHECK);
  NODE_DEFINE_CONSTANT(exports, LZMA_TELL_UNSUPPORTED_CHECK);
  NODE_DEFINE_CONSTANT(exports, LZMA_TELL_ANY_CHECK);
  NODE_DEFINE_CONSTANT(exports, LZMA_CONCATENATED);
  NODE_DEFINE_CONSTANT(exports, LZMA_SYNC_FLUSH);

  // Filters
  NODE_DEFINE_CONSTANT(exports, LZMA_FILTER_LZMA2);
  NODE_DEFINE_CONSTANT(exports, LZMA_FILTER_X86);
  NODE_DEFINE_CONSTANT(exports, LZMA_FILTER_POWERPC);
  NODE_DEFINE_CONSTANT(exports, LZMA_FILTER_IA64);
  NODE_DEFINE_CONSTANT(exports, LZMA_FILTER_ARM);
  NODE_DEFINE_CONSTANT(exports, LZMA_FILTER_ARMTHUMB);
  NODE_DEFINE_CONSTANT(exports, LZMA_FILTER_SPARC);

  // Modes
  NODE_DEFINE_CONSTANT(exports, LZMA_MODE_FAST);
  NODE_DEFINE_CONSTANT(exports, LZMA_MODE_NORMAL);

  // LZMAStream flags
  NODE_DEFINE_CONSTANT(exports, STREAM_ENCODE);
  NODE_DEFINE_CONSTANT(exports, STREAM_DECODE);
#ifdef LIBLZMA_ENABLE_MT
  NODE_DEFINE_CONSTANT(exports, STREAM_ENCODE_MT);
#endif

  // liblzma flags
  NODE_DEFINE_CONSTANT(exports, LZMA_RUN);
  NODE_DEFINE_CONSTANT(exports, LZMA_SYNC_FLUSH);
  NODE_DEFINE_CONSTANT(exports, LZMA_FULL_FLUSH);
  NODE_DEFINE_CONSTANT(exports, LZMA_FINISH);

  // Misc
  NODE_DEFINE_CONSTANT(exports, BUFSIZ);

  // Engine
  LZMA::Init(exports);
}

NODE_MODULE(node_libxz, init);
