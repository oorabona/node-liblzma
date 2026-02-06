#!/usr/bin/env node
// Thin wrapper that delegates to node-liblzma's nxz CLI.
// This package exists so that `npx nxz` works directly.
import 'node-liblzma/cli';
