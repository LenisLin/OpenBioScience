/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getSpaDocumentCacheHeaders } from '../../../packages/web-host/src/static-server';

describe('WebUI static server cache headers', () => {
  it('marks SPA document responses as non-cacheable', () => {
    expect(getSpaDocumentCacheHeaders('/')).toEqual({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });
    expect(getSpaDocumentCacheHeaders('/conversation/abc')).toEqual({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });
  });

  it('leaves static asset responses untouched', () => {
    expect(getSpaDocumentCacheHeaders('/assets/main.js')).toBeNull();
    expect(getSpaDocumentCacheHeaders('/favicon.ico')).toBeNull();
  });
});
