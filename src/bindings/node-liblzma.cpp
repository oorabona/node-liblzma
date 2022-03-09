/**
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
	* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	* GNU General Public License for more details.
	*
	* You should have received a copy of the GNU Lesser General Public License
	* along with this program. If not, see <https://www.gnu.org/licenses/>.
	**/

#include "node-liblzma.hpp"
#include <node_buffer.h>

Napi::Value LZMA::Close(const Napi::CallbackInfo &info) {
	Napi::Env env = info.Env();

	return LZMA::Close(env);
}

Napi::Value LZMA::Close(const Napi::Env &env) {
	Napi::MemoryManagement::AdjustExternalMemory(env, -int64_t(sizeof(LZMA)));

	if(_wip) {
		_pending_close = true;
		return env.Undefined();
	}

	_pending_close = false;

	lzma_end(&_stream);

	return env.Undefined();
}

void LZMA::Init(Napi::Env env, Napi::Object exports) {
	Napi::Function func =
		DefineClass(env,
			"LZMA",
			{
				InstanceMethod("code", &LZMA::Code<true>),
				InstanceMethod("codeSync", &LZMA::Code<false>),
				InstanceMethod("close", &LZMA::Close)
			});

	Napi::FunctionReference* constructor = new Napi::FunctionReference();
	*constructor = Napi::Persistent(func);
	env.SetInstanceData(constructor);

	exports.Set("LZMA", func);
}

LZMA::LZMA(const Napi::CallbackInfo& info) : Napi::ObjectWrap<LZMA>(info), _stream(LZMA_STREAM_INIT),
	_wip(false), _pending_close(false), _worker(nullptr)
{
	Napi::Env env = info.Env();

	if( info.Length() != 2 ) {
		Napi::TypeError::New(env, "Wrong number of arguments, expected mode(int) and opts(object)").ThrowAsJavaScriptException();
		return;
	}

	uint32_t mode = info[0].ToNumber().Uint32Value();

	if (!info[1].IsObject()) {
		Napi::TypeError::New(env, "Expected object as second argument").ThrowAsJavaScriptException();
		return;
	}

	Napi::Object opts = info[1].ToObject();

	Napi::Value optsCheck = opts.Get("check");
	if (!optsCheck.IsNumber()) {
		Napi::TypeError::New(env, "Expected 'check' to be an integer").ThrowAsJavaScriptException();
		return;
	}

	lzma_check check = static_cast<lzma_check>(optsCheck.ToNumber().Uint32Value());

	Napi::Value optsPreset = opts.Get("preset");
	if (!optsPreset.IsNumber()) {
		Napi::TypeError::New(env, "Expected 'preset' to be an integer").ThrowAsJavaScriptException();
		return;
	}

	uint32_t preset = optsPreset.ToNumber().Uint32Value();

	Napi::Value optsFilters = opts.Get("filters");
	if (!optsFilters.IsArray()) {
		Napi::TypeError::New(env, "Expected 'filters' to be an array").ThrowAsJavaScriptException();
		return;
	}

	Napi::Array filters_handle = optsFilters.As<Napi::Array>();

	uint32_t filters_len = filters_handle.Length();

	// We will need to add LZMA_VLI_UNKNOWN after, so user defined filters may
	// not exceed LZMA_FILTERS_MAX - 1.
	if( filters_len > LZMA_FILTERS_MAX - 1) {
		Napi::RangeError::New(env, "More filters than allowed maximum").ThrowAsJavaScriptException();
		return;
	}

	lzma_options_lzma opt_lzma2;
	if( lzma_lzma_preset(&opt_lzma2, preset) ) {
		Napi::Error::New(env, "Unsupported preset, possibly a bug").ThrowAsJavaScriptException();
		return;
	}

	// Add extra slot for LZMA_VLI_UNKNOWN.
	this->filters = new lzma_filter[filters_len + 1];

	for(uint32_t i = 0; i < filters_len; ++i) {
		Napi::Value filter = filters_handle.Get(i);
		if (!filter.IsNumber()) {
			Napi::Error::New(env, "Filter must be an integer").ThrowAsJavaScriptException();
			return;
		}

		uint64_t current = filter.ToNumber().Uint32Value();
		filters[i].id = current;
		if( current == LZMA_FILTER_LZMA2 ) {
			filters[i].options = &opt_lzma2;
		} else {
			filters[i].options = nullptr;
		}
	}

	filters[filters_len] = { .id = LZMA_VLI_UNKNOWN, .options = nullptr };

	lzma_ret ret;
	switch(mode) {
		case STREAM_DECODE: {
			ret = lzma_stream_decoder(&this->_stream, UINT64_MAX, check);
			break;
		}
		case STREAM_ENCODE: {
			Napi::Value optsThreads = opts.Get("threads");
			if (!optsThreads.IsNumber()) {
				Napi::Error::New(env, "Threads must be an integer");
				return;
			}

#ifdef ENABLE_THREAD_SUPPORT
			unsigned int threads = optsThreads.ToNumber().Uint32Value();
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wmissing-field-initializers"

			lzma_mt mt = {
				.flags = 0,
				.threads = threads,
				.block_size = 0,
				.timeout = 0,
				.preset = preset,
				.filters = filters,
				.check = check,
			};

#pragma GCC diagnostic pop

			if( threads > 1 ) {
				ret = lzma_stream_encoder_mt(&this->_stream, &mt);
			} else {
				ret = lzma_stream_encoder(&this->_stream, filters, check);
			}
#else
			ret = lzma_stream_encoder(&this->_stream, filters, check);
#endif
		break;
	}
	default:
		ret = LZMA_OPTIONS_ERROR;
	}

	if (ret != LZMA_OK) {
		Napi::Error::New(env, "LZMA failure, returned " + std::to_string(ret));
		return;
	}

	Napi::MemoryManagement::AdjustExternalMemory(env, sizeof(LZMA));
}

/**<
	* \brief Do the encoding/decoding with async support
	*
	* Function prototype is (sync):
	* .codeSync flushFlag, input_buffer, input_offset, output_buffer, output_offset, callback
	* Function prototype is (async):
	* .code flushFlag, input_buffer, input_offset, availInBefore, output_buffer, output_offset, callback
	*
	* Where:
	* flushFlag: type: Uint32
	* input_buffer: type: Buffer
	* input_offset: type: Uint32
	* availInBefore: type: Uint32
	* output_buffer: type: Buffer
	* output_offset: type: Uint32
	* callback: type: Function
	*/
template<bool async>
Napi::Value LZMA::Code(const Napi::CallbackInfo &info) {
	Napi::Env env = info.Env();

	this->_wip = true;
	this->Ref();

	// Neat trick but that does the job :)
	if (info.Length() != 6+(int)async) {
		Napi::Error::New(env, "BUG?: LZMA::Code requires all these arguments: "
			"flushFlag, input_buffer, input_offset, availInBefore, "
			"output_buffer, output_offset, [callback]").ThrowAsJavaScriptException();
		return env.Undefined();
	}

	if (!info[0].IsNumber()) {
		Napi::Error::New(env, "flushFlag must be an integer");
		return env.Undefined();
	}
	this->_action = static_cast<lzma_action>(info[0].ToNumber().Uint32Value());

	// Evaluate parameters passed to us
	const uint8_t *in;
	uint8_t *out;
	size_t in_off, in_len, out_off, out_len;

		// If we do not have input buffer data
	if (info[1].IsNull()) {
		// just a flush
		// uint8_t nada[1] = { 0 };
		uint8_t nada = 0;
		in = &nada;
		in_len = 0;
		in_off = 0;
	} else {
		// if (!node::Buffer::HasInstance(info[1])) {
		if (!info[1].IsBuffer()) {
			Napi::TypeError::New(env, "BUG?: LZMA::Code 'input_buffer' argument must be a Buffer").ThrowAsJavaScriptException();
			return env.Undefined();
		}

		uint8_t *in_buf = info[1].As<Napi::Buffer<uint8_t>>().Data();
		in_off = info[2].ToNumber().Uint32Value();
		in_len = info[3].ToNumber().Uint32Value();
		size_t in_max = info[1].As<Napi::Buffer<uint8_t>>().Length();

		if(!node::Buffer::IsWithinBounds(in_off, in_len, in_max)) {
			Napi::Error::New(env, "Offset out of bounds!").ThrowAsJavaScriptException();
			return env.Undefined();
		}
		in = in_buf + in_off;
	}

		// Check if output buffer is also a Buffer
	if( !info[4].IsBuffer() ) {
		Napi::TypeError::New(env, "BUG?: LZMA::Code 'output_buffer' argument must be a Buffer").ThrowAsJavaScriptException();
		return env.Undefined();
	}

	uint8_t *out_buf = info[4].As<Napi::Buffer<uint8_t>>().Data();
	out_off = info[5].ToNumber().Uint32Value();
	out_len = info[4].As<Napi::Buffer<uint8_t>>().Length() - out_off;
	out = out_buf + out_off;

	// Only if async mode is enabled shall we need a callback function
	if(async) {
		this->_callback = Napi::Persistent(info[6].As<Napi::Function>());
	}

	this->_stream.next_in = in;
	this->_stream.avail_in = in_len;
	this->_stream.next_out = out;
	this->_stream.avail_out = out_len;

	// do it synchronously
	if(async) {
		this->_worker = new LZMAWorker(env, this);
		this->_worker->Queue();
	} else {
		Process(this);
		return AfterSync(info, this);
	}

	// otherwise queue work, make sure we get our work done by first calling Process and then After
	// napi_create_async_work(uv_default_loop(), &(this->_req), LZMA::Process, LZMA::After);
	return env.Undefined();
}

void LZMA::Process(LZMA* obj) {
	// the real work is done here :)
	obj->_wip = true;
	obj->_ret = lzma_code(&(obj->_stream), obj->_action);
}

void LZMA::After(Napi::Env env, LZMA* obj /*, int status */) {

	Napi::Number ret_code = Napi::Number::New(env, obj->_ret);
	Napi::Number avail_in = Napi::Number::New(env, obj->_stream.avail_in);
	Napi::Number avail_out = Napi::Number::New(env, obj->_stream.avail_out);

	obj->_wip = false;

	obj->_callback.Call({ ret_code, avail_in, avail_out });

	obj->Unref();

	if(obj->_pending_close) {
		obj->Close(env);
	}
}

Napi::Value LZMA::AfterSync(const Napi::CallbackInfo &info, LZMA* obj) {
	Napi::Env env = info.Env();

	Napi::Number ret_code = Napi::Number::New(env, obj->_ret);
	Napi::Number avail_in = Napi::Number::New(env, obj->_stream.avail_in);
	Napi::Number avail_out = Napi::Number::New(env, obj->_stream.avail_out);
	Napi::Array result = Napi::Array::New(env, 3);

	uint32_t i = 0;
		result[i++] = ret_code;
		result[i++] = avail_in;
		result[i++] = avail_out;

		obj->_wip = false;

		obj->Unref();
		if(obj->_pending_close) {
			obj->Close(info);
		}

		return result;
}
