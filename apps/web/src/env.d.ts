/// <reference path="../.astro/types.d.ts" />

import type { Logger } from './lib/logger'

declare global {
  namespace App {
    interface Locals {
      requestId: string
      log: Logger
      runtime?: { env?: Record<string, string | undefined> }
    }
  }
}

export {}
