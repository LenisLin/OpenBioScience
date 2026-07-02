/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from '@/common/theme/types';
import { LIGHT_THEME_ID, DARK_THEME_ID } from '@/common/theme/constants';

import { darkThemeCover, lightThemeCover } from '@renderer/pages/settings/AppearanceSettings/themeCovers';

const T0 = 0;

export const BUILTIN_THEMES: Theme[] = [
  {
    id: LIGHT_THEME_ID,
    name: 'Light',
    appearance: 'light',
    cover: lightThemeCover,
    builtin: true,
    created_at: T0,
    updated_at: T0,
  },
  {
    id: DARK_THEME_ID,
    name: 'Dark',
    appearance: 'dark',
    cover: darkThemeCover,
    builtin: true,
    created_at: T0,
    updated_at: T0,
  },
];

export const BUILTIN_THEME_IDS = new Set(BUILTIN_THEMES.map((t) => t.id));
