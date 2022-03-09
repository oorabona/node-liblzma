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

#include "node-liblzma.hpp"

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
	LZMA::Init(env, exports);

	// Constants
	// enum lzma_ret
	exports.Set(Napi::String::New(env, "LZMA_OK"), Napi::Number::New(env, LZMA_OK));
	exports.Set(Napi::String::New(env, "LZMA_STREAM_END"), Napi::Number::New(env, LZMA_STREAM_END));
	exports.Set(Napi::String::New(env, "LZMA_NO_CHECK"), Napi::Number::New(env, LZMA_NO_CHECK));
	exports.Set(Napi::String::New(env, "LZMA_UNSUPPORTED_CHECK"), Napi::Number::New(env, LZMA_UNSUPPORTED_CHECK));
	exports.Set(Napi::String::New(env, "LZMA_GET_CHECK"), Napi::Number::New(env, LZMA_GET_CHECK));
	exports.Set(Napi::String::New(env, "LZMA_MEM_ERROR"), Napi::Number::New(env, LZMA_MEM_ERROR));
	exports.Set(Napi::String::New(env, "LZMA_MEMLIMIT_ERROR"), Napi::Number::New(env, LZMA_MEMLIMIT_ERROR));
	exports.Set(Napi::String::New(env, "LZMA_FORMAT_ERROR"), Napi::Number::New(env, LZMA_FORMAT_ERROR));
	exports.Set(Napi::String::New(env, "LZMA_OPTIONS_ERROR"), Napi::Number::New(env, LZMA_OPTIONS_ERROR));
	exports.Set(Napi::String::New(env, "LZMA_DATA_ERROR"), Napi::Number::New(env, LZMA_DATA_ERROR));
	exports.Set(Napi::String::New(env, "LZMA_BUF_ERROR"), Napi::Number::New(env, LZMA_BUF_ERROR));
	exports.Set(Napi::String::New(env, "LZMA_PROG_ERROR"), Napi::Number::New(env, LZMA_PROG_ERROR));

	// enum lzma_action
	exports.Set(Napi::String::New(env, "LZMA_RUN"), Napi::Number::New(env, LZMA_RUN));
	exports.Set(Napi::String::New(env, "LZMA_SYNC_FLUSH"), Napi::Number::New(env, LZMA_SYNC_FLUSH));
	exports.Set(Napi::String::New(env, "LZMA_FULL_FLUSH"), Napi::Number::New(env, LZMA_FULL_FLUSH));
	exports.Set(Napi::String::New(env, "LZMA_FINISH"), Napi::Number::New(env, LZMA_FINISH));

	// enum lzma_check
	exports.Set(Napi::String::New(env, "LZMA_CHECK_NONE"), Napi::Number::New(env, LZMA_CHECK_NONE));
	exports.Set(Napi::String::New(env, "LZMA_CHECK_CRC32"), Napi::Number::New(env, LZMA_CHECK_CRC32));
	exports.Set(Napi::String::New(env, "LZMA_CHECK_CRC64"), Napi::Number::New(env, LZMA_CHECK_CRC64));
	exports.Set(Napi::String::New(env, "LZMA_CHECK_SHA256"), Napi::Number::New(env, LZMA_CHECK_SHA256));

	// lzma_match_finder
	exports.Set(Napi::String::New(env, "MF_HC3"), Napi::Number::New(env, LZMA_MF_HC3));
	exports.Set(Napi::String::New(env, "MF_HC4"), Napi::Number::New(env, LZMA_MF_HC4));
	exports.Set(Napi::String::New(env, "MF_BT2"), Napi::Number::New(env, LZMA_MF_BT2));
	exports.Set(Napi::String::New(env, "MF_BT3"), Napi::Number::New(env, LZMA_MF_BT3));
	exports.Set(Napi::String::New(env, "MF_BT4"), Napi::Number::New(env, LZMA_MF_BT4));

	// lzma_mode
	exports.Set(Napi::String::New(env, "LZMA_MODE_FAST"), Napi::Number::New(env, LZMA_MODE_FAST));
	exports.Set(Napi::String::New(env, "LZMA_MODE_NORMAL"), Napi::Number::New(env, LZMA_MODE_NORMAL));

	// defines
	exports.Set(Napi::String::New(env, "LZMA_FILTER_X86"), Napi::Number::New(env, LZMA_FILTER_X86));
	exports.Set(Napi::String::New(env, "LZMA_FILTER_POWERPC"), Napi::Number::New(env, LZMA_FILTER_POWERPC));
	exports.Set(Napi::String::New(env, "LZMA_FILTER_IA64"), Napi::Number::New(env, LZMA_FILTER_IA64));
	exports.Set(Napi::String::New(env, "LZMA_FILTER_ARM"), Napi::Number::New(env, LZMA_FILTER_ARM));
	exports.Set(Napi::String::New(env, "LZMA_FILTER_ARMTHUMB"), Napi::Number::New(env, LZMA_FILTER_ARMTHUMB));
	exports.Set(Napi::String::New(env, "LZMA_FILTER_SPARC"), Napi::Number::New(env, LZMA_FILTER_SPARC));
	exports.Set(Napi::String::New(env, "LZMA_FILTER_DELTA"), Napi::Number::New(env, LZMA_FILTER_DELTA));
	exports.Set(Napi::String::New(env, "LZMA_FILTERS_MAX"), Napi::Number::New(env, LZMA_FILTERS_MAX));
	exports.Set(Napi::String::New(env, "LZMA_FILTER_LZMA1"), Napi::Number::New(env, LZMA_FILTER_LZMA1));
	exports.Set(Napi::String::New(env, "LZMA_FILTER_LZMA2"), Napi::Number::New(env, LZMA_FILTER_LZMA2));
	exports.Set(Napi::String::New(env, "LZMA_VLI_UNKNOWN"), Napi::Number::New(env, LZMA_VLI_UNKNOWN));

	exports.Set(Napi::String::New(env, "LZMA_VLI_BYTES_MAX"), Napi::Number::New(env, LZMA_VLI_BYTES_MAX));
	exports.Set(Napi::String::New(env, "LZMA_CHECK_ID_MAX"), Napi::Number::New(env, LZMA_CHECK_ID_MAX));
	exports.Set(Napi::String::New(env, "LZMA_CHECK_SIZE_MAX"), Napi::Number::New(env, LZMA_CHECK_SIZE_MAX));
	exports.Set(Napi::String::New(env, "LZMA_PRESET_DEFAULT"), Napi::Number::New(env, LZMA_PRESET_DEFAULT));
	exports.Set(Napi::String::New(env, "LZMA_PRESET_LEVEL_MASK"), Napi::Number::New(env, LZMA_PRESET_LEVEL_MASK));
	exports.Set(Napi::String::New(env, "LZMA_PRESET_EXTREME"), Napi::Number::New(env, LZMA_PRESET_EXTREME));
	exports.Set(Napi::String::New(env, "LZMA_TELL_NO_CHECK"), Napi::Number::New(env, LZMA_TELL_NO_CHECK));
	exports.Set(Napi::String::New(env, "LZMA_TELL_UNSUPPORTED_CHECK"), Napi::Number::New(env, LZMA_TELL_UNSUPPORTED_CHECK));
	exports.Set(Napi::String::New(env, "LZMA_TELL_ANY_CHECK"), Napi::Number::New(env, LZMA_TELL_ANY_CHECK));
	exports.Set(Napi::String::New(env, "LZMA_CONCATENATED"), Napi::Number::New(env, LZMA_CONCATENATED));
	exports.Set(Napi::String::New(env, "LZMA_STREAM_HEADER_SIZE"), Napi::Number::New(env, LZMA_STREAM_HEADER_SIZE));
	exports.Set(Napi::String::New(env, "LZMA_VERSION_MAJOR"), Napi::Number::New(env, LZMA_VERSION_MAJOR));
	exports.Set(Napi::String::New(env, "LZMA_VERSION_MINOR"), Napi::Number::New(env, LZMA_VERSION_MINOR));
	exports.Set(Napi::String::New(env, "LZMA_VERSION_PATCH"), Napi::Number::New(env, LZMA_VERSION_PATCH));
	exports.Set(Napi::String::New(env, "LZMA_VERSION_STABILITY"), Napi::Number::New(env, LZMA_VERSION_STABILITY));
	exports.Set(Napi::String::New(env, "LZMA_VERSION_STABILITY_ALPHA"), Napi::Number::New(env, LZMA_VERSION_STABILITY_ALPHA));
	exports.Set(Napi::String::New(env, "LZMA_VERSION_STABILITY_BETA"), Napi::Number::New(env, LZMA_VERSION_STABILITY_BETA));
	exports.Set(Napi::String::New(env, "LZMA_VERSION_STABILITY_STABLE"), Napi::Number::New(env, LZMA_VERSION_STABILITY_STABLE));
	exports.Set(Napi::String::New(env, "LZMA_VERSION"), Napi::Number::New(env, LZMA_VERSION));
	exports.Set(Napi::String::New(env, "LZMA_VERSION_STRING"), Napi::String::New(env, LZMA_VERSION_STRING));

	// LZMAStream flags
	exports.Set(Napi::String::New(env, "STREAM_ENCODE"), Napi::Number::New(env, STREAM_ENCODE));
	exports.Set(Napi::String::New(env, "STREAM_DECODE"), Napi::Number::New(env, STREAM_DECODE));
	exports.Set(Napi::String::New(env, "BUFSIZ"), Napi::Number::New(env, BUFSIZ));

	// Tell companion script if we are thread-able or not
	exports.Set(Napi::String::New(env, "HAS_THREADS_SUPPORT"), Napi::Boolean::New(env, HAS_THREADS_SUPPORT));
	return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
