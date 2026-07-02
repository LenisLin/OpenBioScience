/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('petAPI', {
  onStateChange: (cb: (state: string) => void) => {
    ipcRenderer.on('pet:state-changed', (_e, state: string) => cb(state));
  },
  onStyleChange: (cb: (style: 'deepscientist' | 'classic' | 'paperfold' | 'observatory') => void) => {
    ipcRenderer.on('pet:style-changed', (_e, style: 'deepscientist' | 'classic' | 'paperfold' | 'observatory') =>
      cb(style)
    );
  },
  onEyeMove: (cb: (data: { eyeDx: number; eyeDy: number; bodyDx: number; bodyRotate: number }) => void) => {
    ipcRenderer.on('pet:eye-move', (_e, data) => cb(data));
  },
  onResize: (cb: (size: number) => void) => {
    ipcRenderer.on('pet:resize', (_e, size: number) => cb(size));
  },
});
