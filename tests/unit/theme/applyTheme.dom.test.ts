import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configService } from '@/common/config/configService';
import { ipcBridge } from '@/common';
import { applyTheme, setActiveTheme } from '@/renderer/utils/theme/applyTheme';
import type { Theme } from '@/common/theme/types';

const base = { builtin: true, created_at: 0, updated_at: 0 };

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.body.removeAttribute('arco-theme');
  document.getElementById('theme-tokens')?.remove();
  document.getElementById('theme-decoration')?.remove();
});

describe('applyTheme', () => {
  it('sets appearance attributes', () => {
    applyTheme({ ...base, id: 'dark', name: 'Dark', appearance: 'dark' } as Theme);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.body.getAttribute('arco-theme')).toBe('dark');
  });
  it('injects decoration css when present and removes when absent', () => {
    applyTheme({ ...base, id: 'hk', name: 'HK', appearance: 'light', css: 'body{color:red}' } as Theme);
    expect(document.getElementById('theme-decoration')?.textContent).toContain('color:red');
    applyTheme({ ...base, id: 'light', name: 'Light', appearance: 'light' } as Theme);
    expect(document.getElementById('theme-decoration')).toBeNull();
  });
  it('writes tokens to a :root style block when present', () => {
    applyTheme({ ...base, id: 't', name: 'T', appearance: 'light', tokens: { '--primary': '#abc' } } as Theme);
    expect(document.getElementById('theme-tokens')?.textContent).toContain('--primary: #abc');
  });

  it('does not block current-window theme selection on cross-window broadcast', async () => {
    const configSetSpy = vi.spyOn(configService, 'set').mockResolvedValue(undefined);
    const relaySpy = vi
      .spyOn(ipcBridge.theme.setActive, 'invoke')
      .mockReturnValue(new Promise(() => {}) as ReturnType<typeof ipcBridge.theme.setActive.invoke>);

    await setActiveTheme('dark');

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.body.getAttribute('arco-theme')).toBe('dark');
    expect(configSetSpy).toHaveBeenCalledWith('theme.activeId', 'dark');
    expect(relaySpy).toHaveBeenCalledOnce();

    configSetSpy.mockRestore();
    relaySpy.mockRestore();
  });
});
