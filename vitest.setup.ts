// This file sets up Vitest globals for TypeScript
import { expect, vi } from 'vitest'

// Re-export Vitest globals
global.expect = expect;
global.vi = vi;