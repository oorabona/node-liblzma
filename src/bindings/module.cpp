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

using namespace v8;

void moduleInit(Local<Object> exports) {
	LZMA::Init(exports);

	// enum lzma_ret
	exports->Set(NewString("LZMA_OK"),                Nan::New<Number>(LZMA_OK));
	exports->Set(NewString("LZMA_STREAM_END"),        Nan::New<Number>(LZMA_STREAM_END));
	exports->Set(NewString("LZMA_NO_CHECK"),          Nan::New<Number>(LZMA_NO_CHECK));
	exports->Set(NewString("LZMA_UNSUPPORTED_CHECK"), Nan::New<Number>(LZMA_UNSUPPORTED_CHECK));
	exports->Set(NewString("LZMA_GET_CHECK"),         Nan::New<Number>(LZMA_GET_CHECK));
	exports->Set(NewString("LZMA_MEM_ERROR"),         Nan::New<Number>(LZMA_MEM_ERROR));
	exports->Set(NewString("LZMA_MEMLIMIT_ERROR"),    Nan::New<Number>(LZMA_MEMLIMIT_ERROR));
	exports->Set(NewString("LZMA_FORMAT_ERROR"),      Nan::New<Number>(LZMA_FORMAT_ERROR));
	exports->Set(NewString("LZMA_OPTIONS_ERROR"),     Nan::New<Number>(LZMA_OPTIONS_ERROR));
	exports->Set(NewString("LZMA_DATA_ERROR"),        Nan::New<Number>(LZMA_DATA_ERROR));
	exports->Set(NewString("LZMA_BUF_ERROR"),         Nan::New<Number>(LZMA_BUF_ERROR));
	exports->Set(NewString("LZMA_PROG_ERROR"),        Nan::New<Number>(LZMA_PROG_ERROR));

	// enum lzma_action
	exports->Set(NewString("LZMA_RUN"),        Nan::New<Number>(LZMA_RUN));
	exports->Set(NewString("LZMA_SYNC_FLUSH"), Nan::New<Number>(LZMA_SYNC_FLUSH));
	exports->Set(NewString("LZMA_FULL_FLUSH"), Nan::New<Number>(LZMA_FULL_FLUSH));
	exports->Set(NewString("LZMA_FINISH"),     Nan::New<Number>(LZMA_FINISH));

	// enum lzma_check
	exports->Set(NewString("LZMA_CHECK_NONE"),   Nan::New<Number>(LZMA_CHECK_NONE));
	exports->Set(NewString("LZMA_CHECK_CRC32"),  Nan::New<Number>(LZMA_CHECK_CRC32));
	exports->Set(NewString("LZMA_CHECK_CRC64"),  Nan::New<Number>(LZMA_CHECK_CRC64));
	exports->Set(NewString("LZMA_CHECK_SHA256"), Nan::New<Number>(LZMA_CHECK_SHA256));

	// lzma_match_finder
	exports->Set(NewString("MF_HC3"), Nan::New<Number>(LZMA_MF_HC3));
	exports->Set(NewString("MF_HC4"), Nan::New<Number>(LZMA_MF_HC4));
	exports->Set(NewString("MF_BT2"), Nan::New<Number>(LZMA_MF_BT2));
	exports->Set(NewString("MF_BT3"), Nan::New<Number>(LZMA_MF_BT3));
	exports->Set(NewString("MF_BT4"), Nan::New<Number>(LZMA_MF_BT4));

	// lzma_mode
	exports->Set(NewString("LZMA_MODE_FAST"),   Nan::New<Number>(LZMA_MODE_FAST));
	exports->Set(NewString("LZMA_MODE_NORMAL"), Nan::New<Number>(LZMA_MODE_NORMAL));

	// defines
	exports->Set(NewString("LZMA_FILTER_X86"),          Nan::New<Number>(LZMA_FILTER_X86));
	exports->Set(NewString("LZMA_FILTER_POWERPC"),      Nan::New<Number>(LZMA_FILTER_POWERPC));
	exports->Set(NewString("LZMA_FILTER_IA64"),         Nan::New<Number>(LZMA_FILTER_IA64));
	exports->Set(NewString("LZMA_FILTER_ARM"),          Nan::New<Number>(LZMA_FILTER_ARM));
	exports->Set(NewString("LZMA_FILTER_ARMTHUMB"),     Nan::New<Number>(LZMA_FILTER_ARMTHUMB));
	exports->Set(NewString("LZMA_FILTER_SPARC"),        Nan::New<Number>(LZMA_FILTER_SPARC));
	exports->Set(NewString("LZMA_FILTER_DELTA"),        Nan::New<Number>(LZMA_FILTER_DELTA));
	exports->Set(NewString("LZMA_FILTERS_MAX"),         Nan::New<Number>(LZMA_FILTERS_MAX));
	exports->Set(NewString("LZMA_FILTER_LZMA1"),        Nan::New<Number>(LZMA_FILTER_LZMA1));
	exports->Set(NewString("LZMA_FILTER_LZMA2"),        Nan::New<Number>(LZMA_FILTER_LZMA2));
	exports->Set(NewString("LZMA_VLI_UNKNOWN"),         Nan::New<Number>(LZMA_VLI_UNKNOWN));

	exports->Set(NewString("LZMA_VLI_BYTES_MAX"),            Nan::New<Number>(LZMA_VLI_BYTES_MAX));
	exports->Set(NewString("LZMA_CHECK_ID_MAX"),             Nan::New<Number>(LZMA_CHECK_ID_MAX));
	exports->Set(NewString("LZMA_CHECK_SIZE_MAX"),           Nan::New<Number>(LZMA_CHECK_SIZE_MAX));
	exports->Set(NewString("LZMA_PRESET_DEFAULT"),           Nan::New<Number>(LZMA_PRESET_DEFAULT));
	exports->Set(NewString("LZMA_PRESET_LEVEL_MASK"),        Nan::New<Number>(LZMA_PRESET_LEVEL_MASK));
	exports->Set(NewString("LZMA_PRESET_EXTREME"),           Nan::New<Number>(LZMA_PRESET_EXTREME));
	exports->Set(NewString("LZMA_TELL_NO_CHECK"),            Nan::New<Number>(LZMA_TELL_NO_CHECK));
	exports->Set(NewString("LZMA_TELL_UNSUPPORTED_CHECK"),   Nan::New<Number>(LZMA_TELL_UNSUPPORTED_CHECK));
	exports->Set(NewString("LZMA_TELL_ANY_CHECK"),           Nan::New<Number>(LZMA_TELL_ANY_CHECK));
	exports->Set(NewString("LZMA_CONCATENATED"),             Nan::New<Number>(LZMA_CONCATENATED));
	exports->Set(NewString("LZMA_STREAM_HEADER_SIZE"),       Nan::New<Number>(LZMA_STREAM_HEADER_SIZE));
	exports->Set(NewString("LZMA_VERSION_MAJOR"),            Nan::New<Number>(LZMA_VERSION_MAJOR));
	exports->Set(NewString("LZMA_VERSION_MINOR"),            Nan::New<Number>(LZMA_VERSION_MINOR));
	exports->Set(NewString("LZMA_VERSION_PATCH"),            Nan::New<Number>(LZMA_VERSION_PATCH));
	exports->Set(NewString("LZMA_VERSION_STABILITY"),        Nan::New<Number>(LZMA_VERSION_STABILITY));
	exports->Set(NewString("LZMA_VERSION_STABILITY_ALPHA"),  Nan::New<Number>(LZMA_VERSION_STABILITY_ALPHA));
	exports->Set(NewString("LZMA_VERSION_STABILITY_BETA"),   Nan::New<Number>(LZMA_VERSION_STABILITY_BETA));
	exports->Set(NewString("LZMA_VERSION_STABILITY_STABLE"), Nan::New<Number>(LZMA_VERSION_STABILITY_STABLE));
	exports->Set(NewString("LZMA_VERSION"),                  Nan::New<Number>(LZMA_VERSION));
	exports->Set(NewString("LZMA_VERSION_STRING"),           NewString(LZMA_VERSION_STRING));

  // LZMAStream flags
  exports->Set(NewString("STREAM_ENCODE"),                  Nan::New<Number>(STREAM_ENCODE));
  exports->Set(NewString("STREAM_DECODE"),                  Nan::New<Number>(STREAM_DECODE));
#ifdef LIBLZMA_ENABLE_MT
  exports->Set(NewString("STREAM_ENCODE_MT"),                  Nan::New<Number>(STREAM_ENCODE_MT));
#endif

  exports->Set(NewString("BUFSIZ"),                  Nan::New<Number>(BUFSIZ));
	// exports->Set(NewString("asyncCodeAvailable"),       Nan::New<Boolean>(LZMAStream::asyncCodeAvailable));
}

NODE_MODULE(node_liblzma, moduleInit)
