import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import i18nConfig from '@/common/config/i18n-config.json';

describe('team runtime UI removal', () => {
  it('does not keep team runtime translations in the renderer locale bundle', () => {
    const localePath = resolve(process.cwd(), 'packages/desktop/src/renderer/services/i18n/locales/zh-CN/team.json');
    expect(existsSync(localePath)).toBe(false);
    expect(i18nConfig.modules).not.toContain('team');
  });
});
