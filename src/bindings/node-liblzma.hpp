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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 **/

#ifndef BUILDING_NODE_EXTENSION
#define BUILDING_NODE_EXTENSION
#endif

#ifndef NODE_LIBLZMA_H
#define NODE_LIBLZMA_H

#include <lzma.h>
#include <napi.h>

#include <sstream>
#include <memory>
#include <functional>

constexpr unsigned int STREAM_ENCODE = 0;
constexpr unsigned int STREAM_DECODE = 1;
constexpr int SYNC_PARAM_COUNT = 6;
constexpr int ASYNC_PARAM_COUNT = 7;

#ifdef ENABLE_THREAD_SUPPORT
constexpr bool HAS_THREADS_SUPPORT = true;
#else
constexpr bool HAS_THREADS_SUPPORT = false;
#endif

class LZMAWorker;
class LZMA : public Napi::ObjectWrap<LZMA>
{
public:
	static void Init(Napi::Env env, Napi::Object exports);

	explicit LZMA(const Napi::CallbackInfo &info);
	~LZMA();

	Napi::Value Close(const Napi::CallbackInfo &info);
	Napi::Value Close(const Napi::Env &env);

	template <bool async>
	Napi::Value Code(const Napi::CallbackInfo &info);

	static void Process(LZMA *obj);
	static Napi::Value AfterSync(const Napi::CallbackInfo &info, LZMA *obj);

	// Allow LZMAWorker access to private members
	friend class LZMAWorker;

private:
	// Buffer preparation and validation
	struct BufferContext
	{
		const uint8_t *in;
		uint8_t *out;
		size_t in_len, out_len, in_off, out_off;
	};

	template <bool async>
	bool ValidateAndPrepareBuffers(const Napi::CallbackInfo &info, BufferContext &ctx);

	Napi::Value StartAsyncWork(const Napi::CallbackInfo &info);
	Napi::Value ExecuteSyncWork(const Napi::CallbackInfo &info);

	// Constructor helpers
	bool ValidateConstructorArgs(const Napi::CallbackInfo &info, uint32_t &mode, Napi::Object &opts);
	bool InitializeFilters(const Napi::Object &opts, uint32_t preset);
	bool InitializeEncoder(const Napi::Object &opts, uint32_t preset, lzma_check check);
	bool InitializeDecoder(const Napi::Env &env);

	// Common cleanup operations for both sync and async completion
	void AfterCommon(const Napi::Env &env);

	// Unified completion helpers (overloaded):
	// - After(env): builds result array, marks done, cleans up, returns array (sync path)
	// - After(env, cb): builds result array, marks done, calls cb, then cleans up (async path)
	Napi::Array After(const Napi::Env &env);
	void After(const Napi::Env &env, const Napi::Function &cb);

	lzma_stream _stream;
	bool _wip;
	bool _pending_close;
	bool _closed;  // F-006: Prevent double-subtract in AdjustExternalMemory

	LZMAWorker *_worker;

	lzma_action _action;
	lzma_ret _ret;
	std::unique_ptr<lzma_filter[]> filters;
	// Persist LZMA2 options referenced by filters to avoid dangling pointer
	lzma_options_lzma _opt_lzma2;

	// Keep input/output Buffers alive while async work runs
	Napi::Reference<Napi::Buffer<uint8_t>> _in_buf_ref;
	Napi::Reference<Napi::Buffer<uint8_t>> _out_buf_ref;
};

class LZMAWorker : public Napi::AsyncWorker
{
public:
	LZMAWorker(Napi::Env env, LZMA *instance, Napi::Function cb)
		: AsyncWorker(cb, "LZMAWorker"), lzma(instance)
	{
		// Set work in progress flag when worker is created
		lzma->_wip = true;
	}
	~LZMAWorker() = default;

	void Execute() override
	{
		// Perform the compression/decompression step
		LZMA::Process(this->lzma);
	}
	void OnOK() override
	{
		lzma->After(Env(), Callback().Value());
	}
	void OnError(const Napi::Error & /*e*/) override
	{
		// Fallback to a generic programming error code
		// Set a generic error code so BuildResult exposes it
		lzma->_ret = LZMA_PROG_ERROR;
		lzma->After(Env(), Callback().Value());
	}

private:
	LZMA *lzma;
};

#endif // NODE_LIBLZMA_H
