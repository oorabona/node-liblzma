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
#include <cstring>

// XZ magic bytes: 0xFD + "7zXZ" + 0x00
static const uint8_t XZ_MAGIC[6] = {0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00};

/**
 * Check if a buffer starts with the XZ magic bytes.
 * @param info[0] Buffer to check
 * @returns true if the buffer is an XZ stream, false otherwise
 */
Napi::Value IsXZ(const Napi::CallbackInfo &info)
{
	Napi::Env env = info.Env();

	if (info.Length() < 1 || !info[0].IsBuffer())
	{
		Napi::TypeError::New(env, "Expected a Buffer argument").ThrowAsJavaScriptException();
		return env.Null();
	}

	Napi::Buffer<uint8_t> buf = info[0].As<Napi::Buffer<uint8_t>>();

	// Need at least 6 bytes for XZ magic
	if (buf.Length() < 6)
	{
		return Napi::Boolean::New(env, false);
	}

	bool isXz = std::memcmp(buf.Data(), XZ_MAGIC, 6) == 0;
	return Napi::Boolean::New(env, isXz);
}

/**
 * Get liblzma version string (runtime).
 * @returns Version string like "5.4.1"
 */
Napi::Value VersionString(const Napi::CallbackInfo &info)
{
	Napi::Env env = info.Env();
	return Napi::String::New(env, lzma_version_string());
}

/**
 * Get liblzma version number (runtime).
 * @returns Version as integer (e.g., 50040010 for 5.4.1)
 */
Napi::Value VersionNumber(const Napi::CallbackInfo &info)
{
	Napi::Env env = info.Env();
	return Napi::Number::New(env, static_cast<double>(lzma_version_number()));
}

/**
 * Get memory usage for easy encoder with given preset.
 * @param info[0] Preset level (0-9, optionally OR'd with LZMA_PRESET_EXTREME)
 * @returns Memory usage in bytes, or 0 if preset is invalid
 */
Napi::Value EasyEncoderMemusage(const Napi::CallbackInfo &info)
{
	Napi::Env env = info.Env();

	if (info.Length() < 1 || !info[0].IsNumber())
	{
		Napi::TypeError::New(env, "Expected a preset number argument").ThrowAsJavaScriptException();
		return env.Null();
	}

	uint32_t preset = info[0].As<Napi::Number>().Uint32Value();
	uint64_t memusage = lzma_easy_encoder_memusage(preset);

	return Napi::Number::New(env, static_cast<double>(memusage));
}

/**
 * Get memory usage for easy decoder.
 * @returns Memory usage in bytes
 */
Napi::Value EasyDecoderMemusage(const Napi::CallbackInfo &info)
{
	Napi::Env env = info.Env();

	// lzma_easy_decoder_memusage takes a preset for memlimit estimation
	// but the actual decoder doesn't need a preset. Use default preset.
	uint64_t memusage = lzma_easy_decoder_memusage(LZMA_PRESET_DEFAULT);

	return Napi::Number::New(env, static_cast<double>(memusage));
}

/**
 * Parse the Stream Footer and Index from an XZ file to get metadata.
 * @param info[0] Buffer containing the XZ file (must be complete)
 * @returns Object with uncompressed_size, compressed_size, stream_count, block_count, check
 */
Napi::Value ParseFileIndex(const Napi::CallbackInfo &info)
{
	Napi::Env env = info.Env();

	if (info.Length() < 1 || !info[0].IsBuffer())
	{
		Napi::TypeError::New(env, "Expected a Buffer argument").ThrowAsJavaScriptException();
		return env.Null();
	}

	Napi::Buffer<uint8_t> buf = info[0].As<Napi::Buffer<uint8_t>>();
	const uint8_t *data = buf.Data();
	size_t size = buf.Length();

	// Minimum XZ file: header (12) + block (varies) + index (varies) + footer (12)
	// Stream header is 12 bytes, footer is 12 bytes
	if (size < LZMA_STREAM_HEADER_SIZE * 2)
	{
		Napi::Error::New(env, "Buffer too small for XZ stream").ThrowAsJavaScriptException();
		return env.Null();
	}

	// Verify XZ magic
	if (std::memcmp(data, XZ_MAGIC, 6) != 0)
	{
		Napi::Error::New(env, "Not an XZ stream (invalid magic)").ThrowAsJavaScriptException();
		return env.Null();
	}

	// Parse stream header
	lzma_stream_flags header_flags;
	lzma_ret ret = lzma_stream_header_decode(&header_flags, data);
	if (ret != LZMA_OK)
	{
		Napi::Error::New(env, "Failed to decode stream header").ThrowAsJavaScriptException();
		return env.Null();
	}

	// Parse stream footer (last 12 bytes)
	lzma_stream_flags footer_flags;
	ret = lzma_stream_footer_decode(&footer_flags, data + size - LZMA_STREAM_HEADER_SIZE);
	if (ret != LZMA_OK)
	{
		Napi::Error::New(env, "Failed to decode stream footer").ThrowAsJavaScriptException();
		return env.Null();
	}

	// Verify header and footer match
	ret = lzma_stream_flags_compare(&header_flags, &footer_flags);
	if (ret != LZMA_OK)
	{
		Napi::Error::New(env, "Stream header and footer do not match").ThrowAsJavaScriptException();
		return env.Null();
	}

	// Calculate index position: footer starts at (size - 12), index is backward_size bytes before that
	size_t footer_pos = size - LZMA_STREAM_HEADER_SIZE;
	size_t index_size = footer_flags.backward_size;

	if (index_size > footer_pos - LZMA_STREAM_HEADER_SIZE)
	{
		Napi::Error::New(env, "Invalid index size in footer").ThrowAsJavaScriptException();
		return env.Null();
	}

	size_t index_pos = footer_pos - index_size;

	// Decode the index
	lzma_index *index = nullptr;
	uint64_t memlimit = UINT64_MAX;
	size_t in_pos = 0;

	ret = lzma_index_buffer_decode(&index, &memlimit, nullptr,
								   data + index_pos, &in_pos, index_size);
	if (ret != LZMA_OK || index == nullptr)
	{
		Napi::Error::New(env, "Failed to decode index").ThrowAsJavaScriptException();
		return env.Null();
	}

	// Extract metadata from index
	Napi::Object result = Napi::Object::New(env);
	result.Set("uncompressedSize", Napi::Number::New(env, static_cast<double>(lzma_index_uncompressed_size(index))));
	result.Set("compressedSize", Napi::Number::New(env, static_cast<double>(lzma_index_total_size(index))));
	result.Set("streamCount", Napi::Number::New(env, static_cast<double>(lzma_index_stream_count(index))));
	result.Set("blockCount", Napi::Number::New(env, static_cast<double>(lzma_index_block_count(index))));
	result.Set("check", Napi::Number::New(env, static_cast<double>(footer_flags.check)));
	result.Set("memoryUsage", Napi::Number::New(env, static_cast<double>(lzma_index_memused(index))));

	// Clean up
	lzma_index_end(index, nullptr);

	return result;
}

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

	// Utility functions
	exports.Set(Napi::String::New(env, "isXZ"), Napi::Function::New(env, IsXZ));
	exports.Set(Napi::String::New(env, "versionString"), Napi::Function::New(env, VersionString));
	exports.Set(Napi::String::New(env, "versionNumber"), Napi::Function::New(env, VersionNumber));
	exports.Set(Napi::String::New(env, "easyEncoderMemusage"), Napi::Function::New(env, EasyEncoderMemusage));
	exports.Set(Napi::String::New(env, "easyDecoderMemusage"), Napi::Function::New(env, EasyDecoderMemusage));
	exports.Set(Napi::String::New(env, "parseFileIndex"), Napi::Function::New(env, ParseFileIndex));

	return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
