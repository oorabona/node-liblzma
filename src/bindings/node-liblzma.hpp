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

constexpr unsigned int STREAM_ENCODE = 0;
constexpr unsigned int STREAM_DECODE = 1;
#ifdef ENABLE_THREAD_SUPPORT
constexpr bool HAS_THREADS_SUPPORT = true;
#else
constexpr bool HAS_THREADS_SUPPORT = false;
#endif

class LZMAWorker;
class LZMA : public Napi::ObjectWrap<LZMA> {
public:
	static void Init(Napi::Env env, Napi::Object exports);

	explicit LZMA(const Napi::CallbackInfo& info);
	~LZMA() = default;

  Napi::Value Close(const Napi::CallbackInfo &info);
  Napi::Value Close(const Napi::Env &env);

	template<bool async>
  Napi::Value Code(const Napi::CallbackInfo &info);

	static void Process(LZMA* obj);
	static void After(Napi::Env env, LZMA* obj /*, int status */);
	static Napi::Value AfterSync(const Napi::CallbackInfo &info, LZMA* obj);

private:
	lzma_stream _stream;
	bool _wip;
	bool _pending_close;

  LZMAWorker* _worker;

	lzma_action _action;
	Napi::FunctionReference _callback;
	lzma_ret _ret;
  lzma_filter *filters;
};

class LZMAWorker : public Napi::AsyncWorker {
	public:
		LZMAWorker(Napi::Env env, LZMA* instance) : AsyncWorker(env), lzma(instance) { }
		~LZMAWorker() = default;

		void Execute() {
			LZMA::Process(this->lzma);
		}
		void OnOK() {
			Napi::HandleScope scope(Env());
			LZMA::After(Env(), this->lzma);
		}
		void OnError(const Napi::Error& e) {
			Napi::HandleScope scope(Env());
			LZMA::After(Env(), this->lzma);
		}

	private:
		LZMA *lzma;
};

#endif // NODE_LIBLZMA_H
