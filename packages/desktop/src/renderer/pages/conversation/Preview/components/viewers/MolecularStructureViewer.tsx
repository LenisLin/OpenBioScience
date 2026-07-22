/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  ScienceArtifact,
  ScienceStructureColorBy,
  ScienceStructureFormat,
  ScienceStructureRepresentation,
  ScienceStructureViewerAnnotation,
  ScienceStructureViewerSelection,
} from '@/common/chat/science';
import type {
  PyMolCommandAction,
  PyMolStateChangedEvent,
  PyMolViewerState,
} from '@/common/types/platform/pymolTypes';
import {
  pyMolSelectionToViewerSelection,
  pyMolViewToViewerView,
  reducePyMolViewerState,
  shouldApplyPyMolState,
  shouldReplayPyMolCommand,
  viewerViewToPyMolView,
} from '@/common/types/platform/pymolState';
import { usePreviewContext } from '../../context/PreviewContext';
import { Button, Select } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './MolecularStructureViewer.css';

type ThreeDmolAtom = {
  atom?: string;
  elem?: string;
  chain?: string;
  resi?: number;
  resn?: string;
  serial?: number;
  index?: number;
};

type ThreeDmolViewer = {
  addModel: (data: string, format?: string, options?: unknown) => unknown;
  setStyle: (selection: Record<string, unknown>, style: Record<string, unknown>) => unknown;
  addStyle: (selection: Record<string, unknown>, style: Record<string, unknown>) => unknown;
  setClickable: (
    selection: Record<string, unknown>,
    clickable: boolean,
    callback: (atom: ThreeDmolAtom) => void
  ) => unknown;
  addLabel: (
    text: string,
    options?: Record<string, unknown>,
    selection?: Record<string, unknown>,
    noshow?: boolean
  ) => unknown;
  addSurface: (
    type: unknown,
    style?: Record<string, unknown>,
    atomSelection?: Record<string, unknown>,
    allSelection?: Record<string, unknown>
  ) => unknown;
  selectedAtoms: (selection: Record<string, unknown>) => ThreeDmolAtom[];
  setBackgroundColor: (color: string | number, alpha?: number) => unknown;
  zoomTo: (selection?: Record<string, unknown>) => unknown;
  render: () => unknown;
  resize: () => unknown;
  clear: () => unknown;
  pngURI?: () => string;
  getView: () => number[];
  setView: (view: number[]) => unknown;
  setViewChangeCallback: (callback: (view: number[]) => void) => unknown;
};

type ThreeDmolNamespace = {
  createViewer: (element: HTMLElement, config?: Record<string, unknown>) => ThreeDmolViewer;
  SurfaceType?: {
    VDW?: unknown;
    SAS?: unknown;
  };
};

type StructureStats = {
  atoms?: number;
  residues?: number;
  chains?: number;
  format: ScienceStructureFormat;
};

const FORMAT_BY_EXTENSION: Record<string, ScienceStructureFormat> = {
  pdb: 'pdb',
  ent: 'pdb',
  cif: 'cif',
  mmcif: 'mmcif',
  pqr: 'pqr',
  sdf: 'sdf',
  mol: 'mol',
  mol2: 'mol2',
  xyz: 'xyz',
};

const STRUCTURE_FORMATS = new Set<ScienceStructureFormat>([
  'pdb',
  'cif',
  'mmcif',
  'pqr',
  'sdf',
  'mol',
  'mol2',
  'xyz',
  'unknown',
]);
const MACROMOLECULE_FORMATS = new Set<ScienceStructureFormat>(['pdb', 'cif', 'mmcif', 'pqr']);
const SMALL_MOLECULE_FORMATS = new Set<ScienceStructureFormat>(['sdf', 'mol', 'mol2', 'xyz']);

const representationOptions: ScienceStructureRepresentation[] = ['auto', 'cartoon', 'stick', 'sphere', 'line', 'surface'];
const colorOptions: ScienceStructureColorBy[] = ['auto', 'chain', 'element', 'spectrum', 'plddt'];

const fileExtension = (value?: string): string => {
  if (!value) return '';
  const clean = value.split(/[?#]/)[0] || value;
  const name = clean.replace(/\\/g, '/').split('/').pop() || clean;
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
};

const detectFormat = (
  fileName?: string,
  explicitFormat?: ScienceStructureFormat,
  content?: string
): ScienceStructureFormat => {
  if (explicitFormat && explicitFormat !== 'unknown') return explicitFormat;
  const ext = fileExtension(fileName);
  if (FORMAT_BY_EXTENSION[ext]) return FORMAT_BY_EXTENSION[ext];
  const firstLine = content?.trimStart().slice(0, 120) || '';
  if (/^(ATOM|HETATM|HEADER|MODEL)\b/u.test(firstLine)) return 'pdb';
  if (firstLine.startsWith('data_') || content?.includes('_atom_site.')) return 'cif';
  if (/^\d+\s*$/u.test(firstLine)) return 'xyz';
  return 'unknown';
};

const normalizeStructureFormat = (format?: string): ScienceStructureFormat | undefined => {
  if (!format) return undefined;
  return STRUCTURE_FORMATS.has(format as ScienceStructureFormat) ? (format as ScienceStructureFormat) : undefined;
};

const isStructureAnnotation = (value: unknown): value is ScienceStructureViewerAnnotation =>
  Boolean(value && typeof value === 'object' && typeof (value as Partial<ScienceStructureViewerAnnotation>).label === 'string');

const parserFormat = (format: ScienceStructureFormat): string =>
  format === 'mmcif' ? 'cif' : format === 'unknown' ? 'pdb' : format;

const isMacromolecule = (format: ScienceStructureFormat): boolean => MACROMOLECULE_FORMATS.has(format);

const isSmallMolecule = (format: ScienceStructureFormat): boolean => SMALL_MOLECULE_FORMATS.has(format);

const resolveRepresentation = (
  representation: ScienceStructureRepresentation,
  format: ScienceStructureFormat
): ScienceStructureRepresentation => {
  if (representation !== 'auto') return representation;
  return isMacromolecule(format) ? 'cartoon' : 'stick';
};

const selectionFromSpec = (selection?: ScienceStructureViewerSelection): Record<string, unknown> => {
  if (!selection) return {};
  const next: Record<string, unknown> = {};
  if (selection.chain) next.chain = selection.chain;
  if (selection.ligand) next.resn = selection.ligand;
  if (selection.atomIds?.length) next.index = selection.atomIds;
  if (selection.residues?.length) {
    next.resi = selection.residues;
  } else if (selection.residueStart != null && selection.residueEnd != null) {
    next.resi = `${selection.residueStart}-${selection.residueEnd}`;
  } else if (selection.residueStart != null) {
    next.resi = selection.residueStart;
  }
  return next;
};

const colorStyle = (colorBy: ScienceStructureColorBy, format: ScienceStructureFormat): Record<string, unknown> => {
  if (colorBy === 'plddt') {
    return { colorscheme: { prop: 'b', gradient: 'roygb', min: 50, max: 100 } };
  }
  if (colorBy === 'chain') return { colorscheme: 'chain' };
  if (colorBy === 'spectrum' || (colorBy === 'auto' && isMacromolecule(format))) return { color: 'spectrum' };
  if (colorBy === 'element' || colorBy === 'auto') return { colorscheme: 'Jmol' };
  return {};
};

const applyViewerStyle = (
  viewer: ThreeDmolViewer,
  threeDmol: ThreeDmolNamespace,
  format: ScienceStructureFormat,
  representation: ScienceStructureRepresentation,
  colorBy: ScienceStructureColorBy
): void => {
  const resolvedRepresentation = resolveRepresentation(representation, format);
  const color = colorStyle(colorBy, format);

  if (resolvedRepresentation === 'cartoon' && isMacromolecule(format)) {
    viewer.setStyle({ hetflag: false }, { cartoon: { ...color, thickness: 0.42 } });
    viewer.addStyle({ hetflag: true }, { stick: { radius: 0.16, colorscheme: 'Jmol' } });
    return;
  }

  if (resolvedRepresentation === 'sphere') {
    viewer.setStyle({}, { sphere: { scale: isSmallMolecule(format) ? 0.34 : 0.24, ...color } });
    return;
  }

  if (resolvedRepresentation === 'line') {
    viewer.setStyle({}, { line: { linewidth: 1.4, ...color } });
    return;
  }

  if (resolvedRepresentation === 'surface') {
    viewer.setStyle({}, isMacromolecule(format) ? { cartoon: { color: 'spectrum', opacity: 0.42 } } : { stick: {} });
    viewer.addSurface(threeDmol.SurfaceType?.VDW || 'VDW', { opacity: 0.64, color: '#f8fbf8' }, {}, {});
    return;
  }

  viewer.setStyle({}, { stick: { radius: isSmallMolecule(format) ? 0.18 : 0.14, ...color } });
};

const applyAnnotations = (viewer: ThreeDmolViewer, annotations?: ScienceStructureViewerAnnotation[]): void => {
  for (const annotation of annotations || []) {
    const selection = selectionFromSpec(annotation);
    const color = annotation.color || '#c86b32';
    viewer.addStyle(selection, { stick: { radius: 0.26, color } });
    viewer.addLabel(
      annotation.label,
      {
        backgroundColor: color,
        backgroundOpacity: 0.76,
        borderThickness: 0,
        fontColor: '#ffffff',
        fontSize: 11,
        inFront: false,
        padding: 4,
      },
      selection
    );
  }
};

const estimateStats = (content: string, format: ScienceStructureFormat): StructureStats => {
  if (!content.trim()) return { format };
  if (isMacromolecule(format)) {
    const chains = new Set<string>();
    const residues = new Set<string>();
    let atoms = 0;
    for (const line of content.split(/\r?\n/u)) {
      if (!/^(ATOM|HETATM)\b/u.test(line)) continue;
      atoms += 1;
      const chain = line.slice(21, 22).trim() || line.split(/\s+/u)[5] || '?';
      const residue = line.slice(22, 27).trim() || line.split(/\s+/u)[8] || String(atoms);
      const residueName = line.slice(17, 20).trim() || line.split(/\s+/u)[3] || '';
      chains.add(chain);
      residues.add(`${chain}:${residue}:${residueName}`);
    }
    return {
      format,
      atoms: atoms || undefined,
      residues: residues.size || undefined,
      chains: chains.size || undefined,
    };
  }
  if (format === 'xyz') {
    const atomCount = Number.parseInt(content.trimStart().split(/\r?\n/u)[0] || '', 10);
    return { format, atoms: Number.isFinite(atomCount) ? atomCount : undefined };
  }
  if (format === 'mol' || format === 'sdf') {
    const countsLine = content.split(/\r?\n/u)[3] || '';
    const atomCount = Number.parseInt(countsLine.slice(0, 3).trim(), 10);
    return { format, atoms: Number.isFinite(atomCount) ? atomCount : undefined };
  }
  return { format };
};

const atomLabel = (atom: ThreeDmolAtom): string => {
  const residue = [atom.resn, atom.resi].filter(Boolean).join(' ');
  const atomName = atom.atom || atom.elem || '-';
  return [atom.chain || '-', residue, atomName].filter(Boolean).join(' / ');
};

const backgroundFor = (background: 'light' | 'dark' | 'transparent'): { color: string | number; alpha: number } => {
  if (background === 'dark') return { color: '#111827', alpha: 1 };
  if (background === 'transparent') return { color: '#ffffff', alpha: 0 };
  return { color: '#fbfcfb', alpha: 1 };
};

export interface MolecularStructureViewerProps {
  content: string;
  file_path?: string;
  file_name?: string;
  workspace?: string;
  artifact?: ScienceArtifact;
  conversationId?: string;
}

const MolecularStructureViewer: React.FC<MolecularStructureViewerProps> = ({
  content,
  file_path,
  file_name,
  workspace,
  artifact,
  conversationId,
}) => {
  const { t } = useTranslation();
  const { addToSendBox } = usePreviewContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ThreeDmolViewer | null>(null);
  const [structureContent, setStructureContent] = useState(content);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('ready');
  const [error, setError] = useState<string | null>(null);
  const [selectedAtom, setSelectedAtom] = useState<ThreeDmolAtom | null>(null);
  const [pymolState, dispatchPyMolState] = useReducer(reducePyMolViewerState, null);
  const pymolStateRef = useRef<PyMolViewerState | null>(null);
  const [pymolSyncStatus, setPyMolSyncStatus] = useState<'disabled' | 'connecting' | 'ready' | 'unavailable'>(
    conversationId ? 'connecting' : 'disabled'
  );
  const pymolSyncStatusRef = useRef(pymolSyncStatus);
  const revisionRef = useRef(0);
  const applyingRemoteViewRef = useRef(false);
  const cameraTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialFormat = useMemo(
    () => detectFormat(file_name || file_path, normalizeStructureFormat(artifact?.viewer?.format), structureContent || content),
    [artifact?.viewer?.format, content, file_name, file_path, structureContent]
  );
  const defaultRepresentation = artifact?.viewer?.representation || 'auto';
  const defaultColorBy = artifact?.viewer?.colorBy || 'auto';
  const [representation, setRepresentation] = useState<ScienceStructureRepresentation>(defaultRepresentation);
  const [colorBy, setColorBy] = useState<ScienceStructureColorBy>(defaultColorBy);
  const [background, setBackground] = useState<'light' | 'dark' | 'transparent'>(artifact?.viewer?.background || 'light');

  useEffect(() => {
    pymolSyncStatusRef.current = pymolSyncStatus;
  }, [pymolSyncStatus]);

  const applyIncomingState = useCallback((incoming: PyMolViewerState, force = false) => {
    if (!force && !shouldApplyPyMolState(revisionRef.current, incoming)) return;
    revisionRef.current = incoming.revision;
    pymolStateRef.current = incoming;
    dispatchPyMolState({ type: 'snapshot', state: incoming, force });
    setPyMolSyncStatus(incoming.status === 'ready' ? 'ready' : 'connecting');
    if (incoming.background) setBackground(incoming.background);
    const firstObject = incoming.objects[0];
    if (firstObject?.representation) setRepresentation(firstObject.representation);
    const remoteView = incoming.camera?.viewerView?.length
      ? incoming.camera.viewerView
      : incoming.camera?.pymolView?.length === 18
        ? pyMolViewToViewerView(incoming.camera.pymolView)
        : undefined;
    if (remoteView?.length === 8 && viewerRef.current) {
      applyingRemoteViewRef.current = true;
      viewerRef.current.setView(remoteView);
      viewerRef.current.render();
      if (remoteApplyTimerRef.current) clearTimeout(remoteApplyTimerRef.current);
      remoteApplyTimerRef.current = setTimeout((): void => {
        applyingRemoteViewRef.current = false;
      }, 0);
    }
  }, []);

  const refreshPyMolState = useCallback(async () => {
    if (!conversationId) return undefined;
    const state = await ipcBridge.pymolService.getSession.invoke({ conversationId });
    if (state) applyIncomingState(state, true);
    return state;
  }, [applyIncomingState, conversationId]);

  const sendPyMolCommand = useCallback(
    async (action: PyMolCommandAction, payload: Record<string, unknown>) => {
      if (!conversationId || pymolSyncStatus === 'unavailable') return undefined;
      const execute = async (retry: boolean) => {
        try {
          const result = await ipcBridge.pymolService.command.invoke({
            conversationId,
            command: {
              commandId: crypto.randomUUID(),
              baseRevision: revisionRef.current,
              source: 'ui',
              action,
              payload,
            },
          });
          applyIncomingState(result.state, true);
          return result;
        } catch (commandError) {
          const status =
            commandError && typeof commandError === 'object' && 'status' in commandError
              ? Number((commandError as { status: unknown }).status)
              : 0;
          if (shouldReplayPyMolCommand(status, retry)) {
            await refreshPyMolState();
            return await execute(false);
          }
          if (status === 404 || status === 501 || status === 0) setPyMolSyncStatus('unavailable');
          throw commandError;
        }
      };
      return await execute(true);
    },
    [applyIncomingState, conversationId, pymolSyncStatus, refreshPyMolState]
  );

  useEffect(() => {
    if (!conversationId) {
      setPyMolSyncStatus('disabled');
      return;
    }
    let cancelled = false;
    setPyMolSyncStatus('connecting');
    void ipcBridge.pymolService.ensureSession
      .invoke({ conversationId })
      .then((result) => {
        if (!cancelled) applyIncomingState(result.state, true);
      })
      .catch(() => {
        if (!cancelled) setPyMolSyncStatus('unavailable');
      });
    const offState = ipcBridge.pymolService.stateChanged.on((event: PyMolStateChangedEvent) => {
      if (!cancelled && event.conversationId === conversationId) applyIncomingState(event.state);
    });
    const offStatus = ipcBridge.pymolService.sessionStatus.on((event) => {
      if (cancelled || event.conversationId !== conversationId) return;
      setPyMolSyncStatus(event.status === 'ready' ? 'ready' : event.status === 'error' ? 'unavailable' : 'connecting');
    });
    const offRender = ipcBridge.pymolService.renderReady.on((event) => {
      if (cancelled || event.conversationId !== conversationId || event.revision < revisionRef.current) return;
      revisionRef.current = event.revision;
      const current = pymolStateRef.current;
      if (current) {
        pymolStateRef.current = {
          ...current,
          revision: event.revision,
          renderPath: event.path,
          renderUrl: event.url,
        };
      }
      dispatchPyMolState({ type: 'renderReady', event });
    });
    const offTransportOpen = ipcBridge.pymolService.transportOpen.on(() => {
      if (cancelled) return;
      void ipcBridge.pymolService.ensureSession
        .invoke({ conversationId })
        .then((result) => {
          if (!cancelled) applyIncomingState(result.state, true);
        })
        .catch(() => {
          if (!cancelled) setPyMolSyncStatus('unavailable');
        });
    });
    const offTransportClose = ipcBridge.pymolService.transportClose.on(() => {
      if (!cancelled && pymolSyncStatusRef.current !== 'unavailable') setPyMolSyncStatus('connecting');
    });
    return () => {
      cancelled = true;
      offState();
      offStatus();
      offRender();
      offTransportOpen();
      offTransportClose();
      if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current);
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
      if (remoteApplyTimerRef.current) clearTimeout(remoteApplyTimerRef.current);
    };
  }, [applyIncomingState, conversationId, refreshPyMolState]);

  useEffect(() => {
    setRepresentation(defaultRepresentation);
    setColorBy(defaultColorBy);
    setBackground(artifact?.viewer?.background || 'light');
  }, [artifact?.id, artifact?.version, artifact?.viewer?.background, defaultColorBy, defaultRepresentation]);

  useEffect(() => {
    let cancelled = false;
    const nextContent = content || '';
    if (nextContent.trim()) {
      setStructureContent(nextContent);
      setLoadState('ready');
      setError(null);
      return;
    }
    if (!file_path) {
      setStructureContent('');
      setLoadState('failed');
      setError(t('preview.pymol.noCoordinates'));
      return;
    }
    setLoadState('loading');
    setError(null);
    void ipcBridge.fs.readFile
      .invoke({ path: file_path, workspace })
      .then((value) => {
        if (cancelled) return;
        if (!value) {
          setLoadState('failed');
          setError(t('preview.pymol.readFailed'));
          return;
        }
        setStructureContent(value);
        setLoadState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadState('failed');
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [content, file_path, t, workspace]);

  const stats = useMemo(() => estimateStats(structureContent, initialFormat), [initialFormat, structureContent]);
  const viewerKey = JSON.stringify(artifact?.viewer || {});

  useEffect(() => {
    const container = containerRef.current;
    if (!container || loadState !== 'ready' || !structureContent.trim()) return;
    let cancelled = false;

    void import('3dmol')
      .then((module) => {
        if (cancelled || !containerRef.current) return;
        const threeDmol = (('default' in module ? module.default : module) || module) as ThreeDmolNamespace;
        container.innerHTML = '';
        const backgroundSpec = backgroundFor(background);
        const viewer = threeDmol.createViewer(container, {
          backgroundColor: backgroundSpec.color,
          antialias: true,
        });
        viewerRef.current = viewer;
        viewer.setBackgroundColor(backgroundSpec.color, backgroundSpec.alpha);
        viewer.addModel(structureContent, parserFormat(initialFormat));
        applyViewerStyle(viewer, threeDmol, initialFormat, representation, colorBy);
        applyAnnotations(viewer, artifact?.viewer?.annotations?.filter(isStructureAnnotation));
        const remoteSelection = pymolStateRef.current?.selections.at(-1);
        const viewerSelection = remoteSelection
          ? pyMolSelectionToViewerSelection(remoteSelection.expression)
          : undefined;
        if (viewerSelection) viewer.addStyle(viewerSelection, { stick: { radius: 0.24, colorscheme: 'cyanCarbon' } });
        viewer.setClickable({}, true, (atom: ThreeDmolAtom): void => {
          setSelectedAtom(atom);
          if (!conversationId || pymolSyncStatus !== 'ready') return;
          const expression = [atom.chain ? `chain ${atom.chain}` : '', atom.resi != null ? `resi ${atom.resi}` : '', atom.atom ? `name ${atom.atom}` : '']
            .filter(Boolean)
            .join(' and ');
          if (expression) void sendPyMolCommand('select', { name: 'ui_selection', expression }).catch((): undefined => undefined);
        });
        viewer.setViewChangeCallback((view: number[]): void => {
          if (applyingRemoteViewRef.current || !conversationId || pymolSyncStatus !== 'ready') return;
          if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current);
          cameraTimerRef.current = setTimeout((): void => {
            void sendPyMolCommand('display', {
              camera: { viewerView: view, pymolView: viewerViewToPyMolView(view) },
            }).catch((): undefined => undefined);
          }, 100);
          if (pymolStateRef.current?.serverOnly) {
            if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
            renderTimerRef.current = setTimeout((): void => {
              void sendPyMolCommand('render', { width: 800, height: 600, ray: false }).catch((): undefined => undefined);
            }, 250);
          }
        });
        const remoteCamera = pymolStateRef.current?.camera;
        const remoteView = remoteCamera?.viewerView?.length
          ? remoteCamera.viewerView
          : remoteCamera?.pymolView?.length === 18
            ? pyMolViewToViewerView(remoteCamera.pymolView)
            : undefined;
        if (remoteView?.length === 8) {
          applyingRemoteViewRef.current = true;
          viewer.setView(remoteView);
          if (remoteApplyTimerRef.current) clearTimeout(remoteApplyTimerRef.current);
          remoteApplyTimerRef.current = setTimeout((): void => {
            applyingRemoteViewRef.current = false;
          }, 0);
        } else {
          const focusSelection = selectionFromSpec(artifact?.viewer?.focus);
          const hasFocus = Object.keys(focusSelection).length > 0;
          viewer.zoomTo(hasFocus ? focusSelection : undefined);
        }
        viewer.render();
      })
      .catch((err) => {
        setLoadState('failed');
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      try {
        viewerRef.current?.clear();
      } catch {
        // 3Dmol may already have released the WebGL context.
      }
      viewerRef.current = null;
      if (container) container.innerHTML = '';
    };
  }, [
    artifact?.viewer?.annotations,
    artifact?.viewer?.focus,
    background,
    colorBy,
    conversationId,
    initialFormat,
    loadState,
    pymolSyncStatus,
    representation,
    sendPyMolCommand,
    structureContent,
    viewerKey,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      viewerRef.current?.resize();
      viewerRef.current?.render();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleRepresentationChange = useCallback(
    (value: ScienceStructureRepresentation) => {
      setRepresentation(value);
      if (value !== 'auto')
        void sendPyMolCommand('display', { selection: 'all', representation: value }).catch((): undefined => undefined);
    },
    [sendPyMolCommand]
  );

  const handleColorChange = useCallback(
    (value: ScienceStructureColorBy) => {
      setColorBy(value);
      if (value === 'plddt')
        void sendPyMolCommand('display', { selection: 'all', colorBy: 'plddt' }).catch((): undefined => undefined);
    },
    [sendPyMolCommand]
  );

  const handleBackgroundChange = useCallback(
    (value: 'light' | 'dark' | 'transparent') => {
      setBackground(value);
      void sendPyMolCommand('display', { background: value }).catch((): undefined => undefined);
    },
    [sendPyMolCommand]
  );

  const handleResetView = useCallback(() => {
    viewerRef.current?.zoomTo();
    viewerRef.current?.render();
  }, []);

  const handlePyMolRender = useCallback(() => {
    void sendPyMolCommand('render', { width: 1200, height: 900, ray: true }).catch((): undefined => undefined);
  }, [sendPyMolCommand]);

  const handleDownloadSnapshot = useCallback(() => {
    const uri = viewerRef.current?.pngURI?.();
    if (!uri) return;
    const link = document.createElement('a');
    link.href = uri;
    link.download = `${(file_name || artifact?.title || 'structure').replace(/\.[^.]+$/u, '')}-view.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [artifact?.title, file_name]);

  const handleSendSelection = useCallback(() => {
    if (!selectedAtom) return;
    const lines = [
      '请基于当前科学结构预览的选中位点继续分析或标注。',
      artifact ? `artifactId=${artifact.id}` : 'artifactId=not_recorded',
      artifact ? `version=${artifact.version}` : 'version=not_recorded',
      file_path ? `file=${file_path}` : 'file=not_recorded',
      `format=${initialFormat}`,
      `selection=${atomLabel(selectedAtom)}`,
      selectedAtom.chain ? `chain=${selectedAtom.chain}` : 'chain=not_recorded',
      selectedAtom.resi != null ? `residue=${selectedAtom.resi}` : 'residue=not_recorded',
      selectedAtom.resn ? `residueName=${selectedAtom.resn}` : 'residueName=not_recorded',
      selectedAtom.atom ? `atom=${selectedAtom.atom}` : 'atom=not_recorded',
      '请先追踪该结构的来源证据、解析/校验证据，再给出生物学或化学解释。',
    ];
    addToSendBox(lines.join('\n'));
  }, [addToSendBox, artifact, file_path, initialFormat, selectedAtom]);

  const evidenceHint = artifact?.evidenceIds?.length
    ? artifact.evidenceIds.join(', ')
    : t('preview.pymol.noEvidence');
  const syncLabel = t(`preview.pymol.sync.${pymolSyncStatus}`);

  return (
    <section className='molecular-structure-viewer' data-testid='molecular-structure-viewer'>
      <div className='molecular-structure-viewer__toolbar'>
        <div className='molecular-structure-viewer__identity'>
          <span>{file_name || artifact?.title || t('preview.pymol.structure')}</span>
          <b>
            {stats.format.toUpperCase()}
            {stats.atoms ? ` / ${t('preview.pymol.atomCount', { count: stats.atoms })}` : ''}
            {stats.residues ? ` / ${t('preview.pymol.residueCount', { count: stats.residues })}` : ''}
            {stats.chains ? ` / ${t('preview.pymol.chainCount', { count: stats.chains })}` : ''}
          </b>
        </div>
        <label>
          <span>{t('preview.pymol.representation')}</span>
          <Select
            size='mini'
            value={representation}
            options={representationOptions.map((option) => ({ label: option, value: option }))}
            onChange={(value) => handleRepresentationChange(value as ScienceStructureRepresentation)}
          />
        </label>
        <label>
          <span>{t('preview.pymol.color')}</span>
          <Select
            size='mini'
            value={colorBy}
            options={colorOptions.map((option) => ({ label: option, value: option }))}
            onChange={(value) => handleColorChange(value as ScienceStructureColorBy)}
          />
        </label>
        <div className='molecular-structure-viewer__backgrounds' aria-label={t('preview.pymol.background')}>
          {(['light', 'dark', 'transparent'] as const).map((item) => (
            <Button
              key={item}
              size='mini'
              type={background === item ? 'primary' : 'secondary'}
              className={background === item ? 'is-active' : undefined}
              onClick={() => handleBackgroundChange(item)}
              title={t(`preview.pymol.backgrounds.${item}`)}
            >
              {item.slice(0, 1).toUpperCase()}
            </Button>
          ))}
        </div>
        <Button size='mini' onClick={handleResetView}>
          {t('preview.pymol.reset')}
        </Button>
        <Button size='mini' onClick={handleDownloadSnapshot}>
          {t('preview.pymol.snapshot')}
        </Button>
        <Button size='mini' disabled={pymolSyncStatus !== 'ready'} onClick={handlePyMolRender}>
          {t('preview.pymol.rayRender')}
        </Button>
      </div>

      <div className='molecular-structure-viewer__stage'>
        {loadState === 'loading' ? (
          <div className='molecular-structure-viewer__state'>{t('preview.pymol.loading')}</div>
        ) : null}
        {loadState === 'failed' ? (
          <div className='molecular-structure-viewer__state is-error'>
            <b>{t('preview.pymol.previewFailed')}</b>
            <span>{error || t('preview.pymol.renderFailed')}</span>
          </div>
        ) : null}
        <div ref={containerRef} className='molecular-structure-viewer__canvas' />
        {pymolState?.serverOnly && pymolState.renderUrl ? (
          <aside className='molecular-structure-viewer__fidelity' data-testid='pymol-fidelity-render'>
            <span>{t('preview.pymol.serverOnly')}</span>
            <img src={pymolState.renderUrl} alt={t('preview.pymol.serverRenderAlt')} />
          </aside>
        ) : null}
      </div>

      <div className='molecular-structure-viewer__footer'>
        <div>
          <span>{t('preview.pymol.renderer')}</span>
          <b>3Dmol.js</b>
        </div>
        <div>
          <span>{t('preview.pymol.evidence')}</span>
          <b>{evidenceHint}</b>
        </div>
        <div>
          <span>{t('preview.pymol.syncLabel')}</span>
          <b>{syncLabel}</b>
        </div>
        <div className='molecular-structure-viewer__selection'>
          <span>{t('preview.pymol.selection')}</span>
          <b>{selectedAtom ? atomLabel(selectedAtom) : t('preview.pymol.selectHint')}</b>
          <Button size='mini' disabled={!selectedAtom} onClick={handleSendSelection}>
            {t('preview.pymol.send')}
          </Button>
        </div>
      </div>
    </section>
  );
};

export default MolecularStructureViewer;
