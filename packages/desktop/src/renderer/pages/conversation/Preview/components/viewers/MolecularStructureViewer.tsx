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
import { usePreviewContext } from '../../context/PreviewContext';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const chain = atom.chain ? `chain ${atom.chain}` : 'no chain';
  const atomName = atom.atom || atom.elem || 'atom';
  return [chain, residue, atomName].filter(Boolean).join(' · ');
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
}

const MolecularStructureViewer: React.FC<MolecularStructureViewerProps> = ({
  content,
  file_path,
  file_name,
  workspace,
  artifact,
}) => {
  const { addToSendBox } = usePreviewContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ThreeDmolViewer | null>(null);
  const [structureContent, setStructureContent] = useState(content);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('ready');
  const [error, setError] = useState<string | null>(null);
  const [selectedAtom, setSelectedAtom] = useState<ThreeDmolAtom | null>(null);

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
      setError('No coordinate content was provided for this structure.');
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
          setError('Unable to read the structure file.');
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
  }, [content, file_path, workspace]);

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
        viewer.setClickable({}, true, (atom) => setSelectedAtom(atom));
        const focusSelection = selectionFromSpec(artifact?.viewer?.focus);
        const hasFocus = Object.keys(focusSelection).length > 0;
        viewer.zoomTo(hasFocus ? focusSelection : undefined);
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
  }, [artifact?.viewer?.annotations, artifact?.viewer?.focus, background, colorBy, initialFormat, loadState, representation, structureContent, viewerKey]);

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

  const handleResetView = useCallback(() => {
    viewerRef.current?.zoomTo();
    viewerRef.current?.render();
  }, []);

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

  const evidenceHint = artifact?.evidenceIds?.length ? artifact.evidenceIds.join(', ') : 'no evidence ids recorded';

  return (
    <section className='molecular-structure-viewer' data-testid='molecular-structure-viewer'>
      <div className='molecular-structure-viewer__toolbar'>
        <div className='molecular-structure-viewer__identity'>
          <span>{file_name || artifact?.title || 'Structure'}</span>
          <b>
            {stats.format.toUpperCase()}
            {stats.atoms ? ` · ${stats.atoms.toLocaleString()} atoms` : ''}
            {stats.residues ? ` · ${stats.residues.toLocaleString()} residues` : ''}
            {stats.chains ? ` · ${stats.chains} chains` : ''}
          </b>
        </div>
        <label>
          <span>Representation</span>
          <select value={representation} onChange={(event) => setRepresentation(event.target.value as ScienceStructureRepresentation)}>
            {representationOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Color</span>
          <select value={colorBy} onChange={(event) => setColorBy(event.target.value as ScienceStructureColorBy)}>
            {colorOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className='molecular-structure-viewer__backgrounds' aria-label='Background'>
          {(['light', 'dark', 'transparent'] as const).map((item) => (
            <button
              key={item}
              type='button'
              className={background === item ? 'is-active' : undefined}
              onClick={() => setBackground(item)}
              title={`${item} background`}
            >
              {item.slice(0, 1).toUpperCase()}
            </button>
          ))}
        </div>
        <button type='button' onClick={handleResetView}>
          Reset
        </button>
        <button type='button' onClick={handleDownloadSnapshot}>
          Snapshot
        </button>
      </div>

      <div className='molecular-structure-viewer__stage'>
        {loadState === 'loading' ? (
          <div className='molecular-structure-viewer__state'>Loading structure...</div>
        ) : null}
        {loadState === 'failed' ? (
          <div className='molecular-structure-viewer__state is-error'>
            <b>Structure preview failed</b>
            <span>{error || 'Unable to render this coordinate file.'}</span>
          </div>
        ) : null}
        <div ref={containerRef} className='molecular-structure-viewer__canvas' />
      </div>

      <div className='molecular-structure-viewer__footer'>
        <div>
          <span>Renderer</span>
          <b>3Dmol.js</b>
        </div>
        <div>
          <span>Evidence</span>
          <b>{evidenceHint}</b>
        </div>
        <div className='molecular-structure-viewer__selection'>
          <span>Selection</span>
          <b>{selectedAtom ? atomLabel(selectedAtom) : 'click an atom or residue'}</b>
          <button type='button' disabled={!selectedAtom} onClick={handleSendSelection}>
            Send
          </button>
        </div>
      </div>
    </section>
  );
};

export default MolecularStructureViewer;
