/**
 * Type declaration for the Emscripten-generated liblzma.js module.
 */
import type { LZMAModule } from "./types.js";

declare function createLZMA(
  moduleArg?: Record<string, unknown>,
): Promise<LZMAModule>;
export default createLZMA;
