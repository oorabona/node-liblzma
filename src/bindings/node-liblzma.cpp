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

#include "node-liblzma.hpp"
#include <node_buffer.h>

using namespace v8;

Nan::Persistent<Function> LZMA::constructor;

#define LZMA_FETCH_SELF() \
	LZMA* self = NULL; \
	if (!info.This().IsEmpty() && info.This()->InternalFieldCount() > 0) { \
		self = Nan::ObjectWrap::Unwrap<LZMA>(info.This()); \
	} \
	if (!self) { \
		_failMissingSelf(info); \
		return; \
	}

void LZMA::Close() {
  if(_wip) {
    _pending_close = true;
    return;
  }

  _pending_close = false;

  lzma_end(&_stream);
}

void LZMA::Init(Local<Object> exports) {
  // constructor template
  Local<FunctionTemplate> t = Nan::New<FunctionTemplate>(New);
  t->InstanceTemplate()->SetInternalFieldCount(1);
  t->SetClassName(NewString("LZMA"));

  // prototype methods
  t->PrototypeTemplate()->Set(NewString("close"), Nan::New<FunctionTemplate>(Close)->GetFunction());
  t->PrototypeTemplate()->Set(NewString("code"), Nan::New<FunctionTemplate>(Code<true>)->GetFunction());
  t->PrototypeTemplate()->Set(NewString("codeSync"), Nan::New<FunctionTemplate>(Code<false>)->GetFunction());

	constructor.Reset(t->GetFunction());
	exports->Set(NewString("LZMA"), Nan::New<Function>(constructor));
}

NAN_METHOD(LZMA::New) {
	Nan::HandleScope scope;
  if (!info.IsConstructCall()) {
    // Invoked as plain function, turn into construct call.
    info.GetReturnValue().Set(Nan::New<Function>(constructor)->NewInstance(0, NULL));
  }

  if( info.Length() != 2 ) {
    Nan::ThrowTypeError(NewString("Wrong number of arguments, expected mode(int) and opts(object)"));
    info.GetReturnValue().SetUndefined();
		return;
  }

  uint32_t mode = info[0]->Uint32Value();

  if (!info[1]->IsObject()) {
    Nan::ThrowTypeError(NewString("Expected object as second argument"));
    info.GetReturnValue().SetUndefined();
		return;
  }

  Local<Object> opts = info[1]->ToObject();
  lzma_check check = static_cast<lzma_check>(opts->Get(NewString("check"))->Uint32Value());
  uint32_t preset = opts->Get(NewString("preset"))->Uint32Value();
  Local<Array> filters_handle = Local<Array>::Cast(opts->Get(NewString("filters")));

  uint32_t filters_len = filters_handle->Length();

  // We will need to add LZMA_VLI_UNKNOWN after, so user defined filters may
  // not exceed LZMA_FILTERS_MAX - 1.
  if( filters_len > LZMA_FILTERS_MAX - 1) {
    Nan::ThrowRangeError(NewString("More filters than allowed maximum"));
    info.GetReturnValue().SetUndefined();
		return;
  }

  lzma_options_lzma opt_lzma2;
  if( lzma_lzma_preset(&opt_lzma2, preset) ) {
    Nan::ThrowError(NewString("Unsupported preset, possibly a bug"));
    info.GetReturnValue().SetUndefined();
		return;
  }

  // Add extra slot for LZMA_VLI_UNKNOWN.
  lzma_filter filters[filters_len+1];

  for(uint32_t i = 0; i < filters_len; ++i) {
    uint64_t current = filters_handle->Get(Nan::New<Integer>(i))->Uint32Value();
    filters[i].id = current;
    if( current == LZMA_FILTER_LZMA2 ) {
      filters[i].options = &opt_lzma2;
    } else {
      filters[i].options = NULL;
    }
  }

  filters[filters_len] = { .id = LZMA_VLI_UNKNOWN, .options = NULL };

  LZMA *self = new LZMA();

  if (!self) {
    Nan::ThrowRangeError("Out of memory, cannot create LZMAStream");
    info.GetReturnValue().SetUndefined();
    return;
  }

  lzma_ret ret;
  switch(mode) {
    case STREAM_DECODE: {
      ret = lzma_stream_decoder(&self->_stream, UINT64_MAX, check);
      break;
    }
    case STREAM_ENCODE: {
      ret = lzma_stream_encoder(&self->_stream, filters, check);
      break;
    }
#ifdef LIBLZMA_ENABLE_MT
    case STREAM_ENCODE_MT: {
      unsigned int threads = opts->Get(NewString("threads"))->Uint32Value();
      lzma_mt mt = {
        .flags = 0,
        .threads = threads,
        .block_size = 0,
        .timeout = 0,
        .preset = preset,
        .filters = filters,
        .check = check,
      };

      ret = lzma_stream_encoder_mt(&self->_stream, &mt);
      break;
    }
#endif
    default:
      ret = LZMA_OPTIONS_ERROR;
  }
  if (ret != LZMA_OK) {
    delete self;
		info.GetReturnValue().Set(Nan::New<Integer>(ret));
    return;
  }

  self->Wrap(info.This());
  Nan::AdjustExternalMemory(sizeof(LZMA));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(LZMA::Close) {
  LZMA_FETCH_SELF();
  self->Close();
  info.GetReturnValue().SetUndefined();
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
NAN_METHOD(LZMA::Code) {
  LZMA_FETCH_SELF();
	Nan::HandleScope scope;

  self->_wip = true;
  self->Ref();

  // Neat trick but that does the job :)
  if (info.Length() != 6+(int)async) {
    Nan::ThrowError(NewString("Requires all these arguments: "
      "flushFlag, input_buffer, input_offset, availInBefore, "
      "output_buffer, output_offset, [callback]"));
    info.GetReturnValue().SetUndefined();
  }

  self->_action = (lzma_action)info[0]->Uint32Value();

  // Evaluate parameters passed to us
  const uint8_t *in;
  uint8_t *out;
  size_t in_off, in_len, out_off, out_len;

  if (info[1]->IsNull()) {
    // just a flush
    uint8_t nada[1] = { 0 };
    in = nada;
    in_len = 0;
    in_off = 0;
  } else {
    if (!node::Buffer::HasInstance(info[1])) {
      Nan::ThrowTypeError(NewString("Argument must be a buffer"));
      info.GetReturnValue().SetUndefined();
    }
    Local<Object> in_buf;
    in_buf = info[1]->ToObject();
    in_off = info[2]->Uint32Value();
    in_len = info[3]->Uint32Value();

    if(!node::Buffer::IsWithinBounds(in_off, in_len, node::Buffer::Length(in_buf))) {
      Nan::ThrowRangeError(NewString("Offset out of bounds!"));
      info.GetReturnValue().SetUndefined();
    }
    in = reinterpret_cast<const uint8_t *>(node::Buffer::Data(in_buf) + in_off);
  }

  Local<Object> out_buf = info[4]->ToObject();
  if( !node::Buffer::HasInstance(out_buf) ) {
    Nan::ThrowTypeError(NewString("Argument must be a buffer"));
    info.GetReturnValue().SetUndefined();
  }

  out_off = info[5]->Uint32Value();
  out_len = node::Buffer::Length(out_buf) - out_off;
  out = reinterpret_cast<uint8_t *>(node::Buffer::Data(out_buf) + out_off);

  // Only if async mode is enabled we need a callback function
  if(async)
    self->_callback.SetFunction(info[6].As<Function>());

  self->_stream.next_in = in;
  self->_stream.avail_in = in_len;
  self->_stream.next_out = out;
  self->_stream.avail_out = out_len;

  self->_req.data = self;

  // do it synchronously
  if(!async) {
    Process(&(self->_req));
		info.GetReturnValue().Set(AfterSync(self));
    return;
  }

  // set a circular point so that we can get work_req structure data
  uv_queue_work(uv_default_loop(), &(self->_req), LZMA::Process, LZMA::After);
  info.GetReturnValue().SetUndefined();
	return;
}

void LZMA::Process(uv_work_t* work_req) {
  LZMA* obj = static_cast<LZMA*>(work_req->data);

  obj->_wip = true;
  obj->_ret = lzma_code(&(obj->_stream), obj->_action);
}

void LZMA::After(uv_work_t* work_req, int status) {
	Nan::HandleScope scope;
  LZMA* obj = static_cast<LZMA*>(work_req->data);

  Local<Number> ret_code = Nan::New<Number>(obj->_ret);
  Local<Number> avail_in = Nan::New<Number>(obj->_stream.avail_in);
  Local<Number> avail_out = Nan::New<Number>(obj->_stream.avail_out);
  Local<Value> argv[3] = { ret_code, avail_in, avail_out };

  obj->_wip = false;

	obj->_callback.Call(ARRAY_SIZE(argv), argv);

  obj->Unref();
  if(obj->_pending_close) {
    obj->Close();
  }
}

Local<Value> LZMA::AfterSync(LZMA* obj) {
	Nan::HandleScope scope;
  Local<Number> ret_code = Nan::New<Number>(obj->_ret);
  Local<Number> avail_in = Nan::New<Number>(obj->_stream.avail_in);
  Local<Number> avail_out = Nan::New<Number>(obj->_stream.avail_out);
  Local<Array> result = Nan::New<Array>(3);
  result->Set(0, ret_code);
  result->Set(1, avail_in);
  result->Set(2, avail_out);

  obj->_wip = false;

  obj->Unref();
  if(obj->_pending_close) {
    obj->Close();
  }

	return result;
}
