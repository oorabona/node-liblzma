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

#include <node_buffer.h>
#include <vector>
#include "node-liblzma.hpp"

Napi::Value LZMA::Close(const Napi::CallbackInfo &info)
{
	Napi::Env env = info.Env();

	return LZMA::Close(env);
}

Napi::Value LZMA::Close(const Napi::Env &env)
{
	Napi::MemoryManagement::AdjustExternalMemory(env, -int64_t(sizeof(LZMA)));

	if (_wip)
	{
		_pending_close = true;
		return env.Undefined();
	}

	_pending_close = false;

	lzma_end(&_stream);

	return env.Undefined();
}

void LZMA::Init(Napi::Env env, Napi::Object exports)
{
	Napi::Function func =
		DefineClass(env,
					"LZMA",
					{InstanceMethod("code", &LZMA::Code<true>),
					 InstanceMethod("codeSync", &LZMA::Code<false>),
					 InstanceMethod("close", &LZMA::Close)});

	Napi::FunctionReference *constructor = new Napi::FunctionReference();
	*constructor = Napi::Persistent(func);
	env.SetInstanceData(constructor);

	exports.Set("LZMA", func);
}

LZMA::LZMA(const Napi::CallbackInfo &info) : Napi::ObjectWrap<LZMA>(info), _stream(LZMA_STREAM_INIT),
											 _wip(false), _pending_close(false), _worker(nullptr)
{
	Napi::Env env = info.Env();

	// Validate constructor arguments
	uint32_t mode;
	Napi::Object opts;
	if (!ValidateConstructorArgs(info, mode, opts))
	{
		return;
	}

	// Validate and extract options
	Napi::Value optsCheck = opts.Get("check");
	if (!optsCheck.IsNumber())
	{
		Napi::TypeError::New(env, "Expected 'check' to be an integer").ThrowAsJavaScriptException();
		return;
	}
	lzma_check check = static_cast<lzma_check>(optsCheck.ToNumber().Uint32Value());

	Napi::Value optsPreset = opts.Get("preset");
	if (!optsPreset.IsNumber())
	{
		Napi::TypeError::New(env, "Expected 'preset' to be an integer").ThrowAsJavaScriptException();
		return;
	}
	uint32_t preset = optsPreset.ToNumber().Uint32Value();

	// Initialize filters
	if (!InitializeFilters(opts, preset))
	{
		return;
	}

	// Initialize encoder or decoder based on mode
	bool success = false;
	switch (mode)
	{
	case STREAM_DECODE:
		success = InitializeDecoder();
		break;
	case STREAM_ENCODE:
		success = InitializeEncoder(opts, preset, check);
		break;
	default:
		Napi::Error::New(env, "Invalid stream mode").ThrowAsJavaScriptException();
		return;
	}

	if (!success)
	{
		return;
	}

	// Register external memory
	Napi::MemoryManagement::AdjustExternalMemory(env, sizeof(LZMA));
}

LZMA::~LZMA()
{
	// Release any Buffer references
	if (!_in_buf_ref.IsEmpty())
		_in_buf_ref.Reset();
	if (!_out_buf_ref.IsEmpty())
		_out_buf_ref.Reset();

	// Cleanup worker if still active
	if (_worker != nullptr)
	{
		_worker = nullptr; // Worker will clean itself up
	}

	// Smart pointer will automatically cleanup filter array
	// filters.reset() is called automatically

	// Ensure LZMA stream is properly cleaned up
	lzma_end(&_stream);
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
template <bool async>
Napi::Value LZMA::Code(const Napi::CallbackInfo &info)
{
	// Setup with manual guard (safer than RAII for JS exceptions)
	this->_wip = true;
	this->Ref();

	// Validate and prepare buffers
	BufferContext ctx;
	if (!ValidateAndPrepareBuffers<async>(info, ctx))
	{
		this->_wip = false;
		this->Unref();
		return info.Env().Undefined();
	}

	// Configure stream with prepared buffers
	this->_stream.next_in = ctx.in;
	this->_stream.avail_in = ctx.in_len;
	this->_stream.next_out = ctx.out;
	this->_stream.avail_out = ctx.out_len;

	// Execute based on mode with minimal branching
	if constexpr (async)
	{
		return StartAsyncWork(info);
	}
	else
	{
		return ExecuteSyncWork(info);
	}
}

void LZMA::Process(LZMA *obj)
{
	// the real work is done here :)
	// Note: _wip should already be set by the caller
	obj->_ret = lzma_code(&(obj->_stream), obj->_action);
}

Napi::Value LZMA::AfterSync(const Napi::CallbackInfo &info, LZMA *obj)
{
	Napi::Env env = info.Env();
	return obj->After(env);
}

template <bool async>
bool LZMA::ValidateAndPrepareBuffers(const Napi::CallbackInfo &info, BufferContext &ctx)
{
	Napi::Env env = info.Env();
	constexpr int expected_args = async ? ASYNC_PARAM_COUNT : SYNC_PARAM_COUNT;

	// Validate parameter count
	if (info.Length() != expected_args)
	{
		Napi::Error::New(env, "BUG?: LZMA::Code requires all these arguments: "
							  "flushFlag, input_buffer, input_offset, availInBefore, "
							  "output_buffer, output_offset" +
								  std::string(async ? ", callback" : ""))
			.ThrowAsJavaScriptException();
		return false;
	}

	// Validate flush flag
	if (!info[0].IsNumber())
	{
		Napi::Error::New(env, "flushFlag must be an integer").ThrowAsJavaScriptException();
		return false;
	}
	this->_action = static_cast<lzma_action>(info[0].ToNumber().Uint32Value());

	// Handle input buffer (can be null for flush operations)
	if (info[1].IsNull())
	{
		ctx.in = nullptr;
		ctx.in_len = 0;
		ctx.in_off = 0;
	}
	else
	{
		if (!info[1].IsBuffer())
		{
			Napi::TypeError::New(env, "BUG?: LZMA::Code 'input_buffer' argument must be a Buffer").ThrowAsJavaScriptException();
			return false;
		}

		uint8_t *in_buf = info[1].As<Napi::Buffer<uint8_t>>().Data();
		ctx.in_off = info[2].ToNumber().Uint32Value();
		ctx.in_len = info[3].ToNumber().Uint32Value();
		size_t in_max = info[1].As<Napi::Buffer<uint8_t>>().Length();

		if (!node::Buffer::IsWithinBounds(ctx.in_off, ctx.in_len, in_max))
		{
			Napi::Error::New(env, "Input offset out of bounds!").ThrowAsJavaScriptException();
			return false;
		}
		ctx.in = in_buf + ctx.in_off;
	}

	// Handle output buffer (required)
	if (!info[4].IsBuffer())
	{
		Napi::TypeError::New(env, "BUG?: LZMA::Code 'output_buffer' argument must be a Buffer").ThrowAsJavaScriptException();
		return false;
	}

	uint8_t *out_buf = info[4].As<Napi::Buffer<uint8_t>>().Data();
	ctx.out_off = info[5].ToNumber().Uint32Value();
	ctx.out_len = info[4].As<Napi::Buffer<uint8_t>>().Length() - ctx.out_off;
	ctx.out = out_buf + ctx.out_off;

	// Validate callback for async mode
	if constexpr (async)
	{
		if (!info[6].IsFunction())
		{
			Napi::TypeError::New(env, "BUG?: LZMA::Code 'callback' argument must be a Function").ThrowAsJavaScriptException();
			return false;
		}
	}

	return true;
}

Napi::Value LZMA::StartAsyncWork(const Napi::CallbackInfo &info)
{
	// Persist buffers so V8 GC can't free them while the async worker runs
	if (!info[1].IsNull() && info[1].IsBuffer())
	{
		this->_in_buf_ref = Napi::Persistent(info[1].As<Napi::Buffer<uint8_t>>());
	}
	this->_out_buf_ref = Napi::Persistent(info[4].As<Napi::Buffer<uint8_t>>());

	// Use the real callback for the worker to own and call
	this->_worker = new LZMAWorker(info.Env(), this, info[6].As<Napi::Function>());
	this->_worker->Queue();

	return info.Env().Undefined();
}

Napi::Value LZMA::ExecuteSyncWork(const Napi::CallbackInfo &info)
{
	Process(this);
	return AfterSync(info, this);
}

bool LZMA::ValidateConstructorArgs(const Napi::CallbackInfo &info, uint32_t &mode, Napi::Object &opts)
{
	Napi::Env env = info.Env();

	if (info.Length() != 2)
	{
		Napi::TypeError::New(env, "Wrong number of arguments, expected mode(int) and opts(object)").ThrowAsJavaScriptException();
		return false;
	}

	if (!info[0].IsNumber())
	{
		Napi::TypeError::New(env, "Expected mode to be an integer").ThrowAsJavaScriptException();
		return false;
	}
	mode = info[0].ToNumber().Uint32Value();

	if (!info[1].IsObject())
	{
		Napi::TypeError::New(env, "Expected object as second argument").ThrowAsJavaScriptException();
		return false;
	}
	opts = info[1].ToObject();

	return true;
}

bool LZMA::InitializeFilters(const Napi::Object &opts, uint32_t preset)
{
	Napi::Env env = opts.Env();

	// Validate and get filters array
	Napi::Value optsFilters = opts.Get("filters");
	if (!optsFilters.IsArray())
	{
		Napi::TypeError::New(env, "Expected 'filters' to be an array").ThrowAsJavaScriptException();
		return false;
	}

	Napi::Array filters_handle = optsFilters.As<Napi::Array>();
	uint32_t filters_len = filters_handle.Length();

	// Validate filter count
	if (filters_len > LZMA_FILTERS_MAX - 1)
	{
		Napi::RangeError::New(env, "More filters than allowed maximum").ThrowAsJavaScriptException();
		return false;
	}

	// Initialize LZMA2 options from preset
	if (lzma_lzma_preset(&this->_opt_lzma2, preset))
	{
		Napi::Error::New(env, "Unsupported preset, possibly a bug").ThrowAsJavaScriptException();
		return false;
	}

	// Allocate filter array with smart pointer
	this->filters = std::make_unique<lzma_filter[]>(filters_len + 1);

	// Configure filters
	for (uint32_t i = 0; i < filters_len; ++i)
	{
		Napi::Value filter = filters_handle.Get(i);
		if (!filter.IsNumber())
		{
			Napi::Error::New(env, "Filter must be an integer").ThrowAsJavaScriptException();
			return false;
		}

		uint64_t current = filter.ToNumber().Uint32Value();
		this->filters[i].id = current;
		if (current == LZMA_FILTER_LZMA2)
		{
			this->filters[i].options = &this->_opt_lzma2;
		}
		else
		{
			this->filters[i].options = nullptr;
		}
	}

	// Set terminator
	this->filters[filters_len] = {.id = LZMA_VLI_UNKNOWN, .options = nullptr};

	return true;
}

bool LZMA::InitializeEncoder(const Napi::Object &opts, uint32_t preset, lzma_check check)
{
	Napi::Env env = opts.Env();

	// Validate threads parameter
	Napi::Value optsThreads = opts.Get("threads");
	if (!optsThreads.IsNumber())
	{
		Napi::Error::New(env, "Threads must be an integer").ThrowAsJavaScriptException();
		return false;
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
		.filters = this->filters.get(),
		.check = check,
	};

#pragma GCC diagnostic pop

	lzma_ret ret;
	if (threads > 1)
	{
		ret = lzma_stream_encoder_mt(&this->_stream, &mt);
	}
	else
	{
		ret = lzma_stream_encoder(&this->_stream, this->filters.get(), check);
	}
#else
	lzma_ret ret = lzma_stream_encoder(&this->_stream, this->filters.get(), check);
#endif

	if (ret != LZMA_OK)
	{
		Napi::Error::New(env, "LZMA encoder failure, returned " + std::to_string(ret)).ThrowAsJavaScriptException();
		return false;
	}

	return true;
}

bool LZMA::InitializeDecoder()
{
	lzma_ret ret = lzma_stream_decoder(&this->_stream, UINT64_MAX, LZMA_CONCATENATED);
	return ret == LZMA_OK;
}

void LZMA::AfterCommon(const Napi::Env &env)
{
	// Mark work done
	this->_wip = false;

	// Clear worker pointer if any
	_worker = nullptr;

	// Release any Buffer references (async path uses these)
	if (!_in_buf_ref.IsEmpty())
		_in_buf_ref.Reset();
	if (!_out_buf_ref.IsEmpty())
		_out_buf_ref.Reset();

	// Balance reference taken in Code()
	Unref();

	// Honor pending close requests
	if (_pending_close)
	{
		Close(env);
	}
}

Napi::Array LZMA::After(const Napi::Env &env)
{
	Napi::HandleScope scope(env);
	Napi::Number ret = Napi::Number::New(env, this->_ret);
	Napi::Number avail_in = Napi::Number::New(env, this->_stream.avail_in);
	Napi::Number avail_out = Napi::Number::New(env, this->_stream.avail_out);

	Napi::Array result = Napi::Array::New(env, 3);
	result[(uint32_t)0] = ret;
	result[(uint32_t)1] = avail_in;
	result[(uint32_t)2] = avail_out;

	AfterCommon(env);

	return result;
}

void LZMA::After(const Napi::Env &env, const Napi::Function &cb)
{
	Napi::HandleScope scope(env);
	Napi::Number ret = Napi::Number::New(env, this->_ret);
	Napi::Number avail_in = Napi::Number::New(env, this->_stream.avail_in);
	Napi::Number avail_out = Napi::Number::New(env, this->_stream.avail_out);

	// Call the provided JS callback with the three numeric results
	cb.Call({ret, avail_in, avail_out});

	AfterCommon(env);
}
