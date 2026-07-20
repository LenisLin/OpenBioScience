/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

const OPENBIOSCIENCE_GENE_SET_ROOT_ENV_KEY = 'OPENBIOSCIENCE_GENE_SET_ROOT';
const OPENBIOSCIENCE_MSIGDB_ROOT_ENV_KEY = 'OPENBIOSCIENCE_MSIGDB_ROOT';
const OPENBIOSCIENCE_MARKER_ROOT_ENV_KEY = 'OPENBIOSCIENCE_MARKER_ROOT';

export type MarkerRecord = {
  id: string;
  species: string;
  context: string;
  compartment: string;
  major_type: string;
  subtype: string;
  state: string | null;
  annotation_level: string;
  ontology_id: string;
  source_paper: string[];
  markers: {
    core: string[];
    supporting: string[];
    negative: string[];
    state: string[];
  };
  notes: string;
  aliases: string[];
  sourceUrl: string;
  evidenceType: string;
  evidenceLocation: string;
  confidence: string;
  exactSignatureGenes: string[];
  resourcePath: string;
  resourceMeta: {
    resourceId: string;
    version: string;
    status: string;
    licenseOrTerms: string;
  };
};

export type MarkerSearchHit = MarkerRecord & {
  score: number;
  matchedFields: string[];
};

export type GeneSetHit = {
  name: string;
  description: string;
  genes: string[];
  geneCount: number;
  collection: string;
  species: 'human' | 'mouse' | 'unknown';
  provider: 'msigdb' | 'compact_fallback';
  resourcePath: string;
  score: number;
  matchedFields: string[];
};

export type KnowledgeResourceRoots = {
  geneSetRoot: string;
  msigdbRoot: string;
  markerRoot: string;
};

export type KnowledgeResourceStatus = KnowledgeResourceRoots & {
  markerFiles: string[];
  markerPackages: MarkerResourceIndexRow[];
  compactGeneSetFiles: string[];
  msigdbFiles: string[];
};

export type MarkerResourceIndexRow = {
  packageId: string;
  resourceId: string;
  version: string;
  availability: 'available' | 'planned' | 'unknown';
  resourceType: string;
  species: string;
  scope: string;
  disease: string;
  modality: string;
  recordCount: number;
  recordsFile: string;
  sourcesFile: string;
  aliasesFile: string;
  metaFile: string;
  keywords: string;
  recommendedUse: string;
  licenseOrTerms: string;
  notes: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const normalized = (value: string): string => value.toLowerCase().replace(/[_+/-]+/gu, ' ').trim();

const tokens = (query: string): string[] => normalized(query).split(/\s+/u).filter(Boolean);

const displayPath = (filePath: string): string => {
  const relative = path.relative(process.cwd(), filePath).replaceAll(path.sep, '/');
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : filePath;
};

const listFiles = (root: string, extensions: string[], options?: { excludeDirNames?: string[] }): string[] => {
  if (!root || !fs.existsSync(root)) return [];
  const found: string[] = [];
  const stack = [root];
  const excludeDirNames = new Set(options?.excludeDirNames || []);
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!excludeDirNames.has(entry.name)) stack.push(next);
      } else if (entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))) {
        found.push(next);
      }
    }
  }
  return found.sort();
};

export const resolveKnowledgeResourceRoots = (env: NodeJS.ProcessEnv = process.env): KnowledgeResourceRoots => {
  const geneSetRoot =
    env[OPENBIOSCIENCE_GENE_SET_ROOT_ENV_KEY]?.trim() ||
    path.resolve(process.cwd(), 'resources', 'bio', 'gene_sets');
  const msigdbRoot = env[OPENBIOSCIENCE_MSIGDB_ROOT_ENV_KEY]?.trim() || path.join(geneSetRoot, 'msigdb');
  const markerRoot =
    env[OPENBIOSCIENCE_MARKER_ROOT_ENV_KEY]?.trim() || path.resolve(process.cwd(), 'resources', 'bio', 'markers');
  return { geneSetRoot, msigdbRoot, markerRoot };
};

export const summarizeKnowledgeResources = (
  env: NodeJS.ProcessEnv = process.env
): KnowledgeResourceStatus => {
  const roots = resolveKnowledgeResourceRoots(env);
  return {
    ...roots,
    markerFiles: listFiles(roots.markerRoot, ['.jsonl']).map(displayPath),
    markerPackages: readMarkerResourceIndex(roots.markerRoot),
    compactGeneSetFiles: listFiles(roots.geneSetRoot, ['.gmt'], { excludeDirNames: ['msigdb'] }).map(displayPath),
    msigdbFiles: listFiles(roots.msigdbRoot, ['.gmt']).map(displayPath),
  };
};

const parseSimpleYaml = (filePath: string): Record<string, string> => {
  if (!fs.existsSync(filePath)) return {};
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/u)) {
    const match = /^([A-Za-z0-9_.-]+):\s*(.+?)\s*$/u.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/gu, '');
  }
  return values;
};

const parseTsvRows = (filePath: string): Record<string, string>[] => {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    return Object.fromEntries(header.map((key, index) => [key, cells[index] || '']));
  });
};

export const readMarkerResourceIndex = (markerRoot: string): MarkerResourceIndexRow[] =>
  parseTsvRows(path.join(markerRoot, 'index.tsv')).map((row) => {
    const availability = row.availability === 'available' || row.availability === 'planned' ? row.availability : 'unknown';
    return {
      packageId: row.package_id || '',
      resourceId: row.resource_id || '',
      version: row.version || '',
      availability,
      resourceType: row.resource_type || '',
      species: row.species || '',
      scope: row.scope || '',
      disease: row.disease || '',
      modality: row.modality || '',
      recordCount: Number.parseInt(row.record_count || '0', 10) || 0,
      recordsFile: row.records_file || '',
      sourcesFile: row.sources_file || '',
      aliasesFile: row.aliases_file || '',
      metaFile: row.meta_file || '',
      keywords: row.keywords || '',
      recommendedUse: row.recommended_use || '',
      licenseOrTerms: row.license_or_terms || '',
      notes: row.notes || '',
    };
  });

const markerMetaPath = (jsonlPath: string): string => {
  const directory = path.dirname(jsonlPath);
  const basename = path.basename(jsonlPath, '.jsonl').replace(/\.v\d+$/u, '');
  return path.join(directory, `${basename}.meta.yaml`);
};

const parseMarkerRecord = (
  raw: unknown,
  resourcePath: string,
  resourceMeta: MarkerRecord['resourceMeta']
): MarkerRecord | undefined => {
  if (!isRecord(raw)) return undefined;
  const markersRaw = isRecord(raw.markers) ? raw.markers : {};
  return {
    id: asString(raw.id),
    species: asString(raw.species),
    context: asString(raw.context),
    compartment: asString(raw.compartment),
    major_type: asString(raw.major_type),
    subtype: asString(raw.subtype),
    state: raw.state === null ? null : asString(raw.state),
    annotation_level: asString(raw.annotation_level),
    ontology_id: asString(raw.ontology_id),
    source_paper: asStringArray(raw.source_paper),
    markers: {
      core: asStringArray(markersRaw.core),
      supporting: asStringArray(markersRaw.supporting),
      negative: asStringArray(markersRaw.negative),
      state: asStringArray(markersRaw.state),
    },
    notes: asString(raw.notes),
    aliases: asStringArray(raw.aliases),
    sourceUrl: asString(raw.source_url),
    evidenceType: asString(raw.evidence_type),
    evidenceLocation: asString(raw.evidence_location),
    confidence: asString(raw.confidence),
    exactSignatureGenes: asStringArray(raw.exact_signature_genes),
    resourcePath,
    resourceMeta,
  };
};

const readMarkerRecords = (markerRoot: string): MarkerRecord[] =>
  listFiles(markerRoot, ['.jsonl']).flatMap((filePath) => {
    const resourcePath = displayPath(filePath);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const meta = parseSimpleYaml(markerMetaPath(filePath));
      const resourceMeta = {
        resourceId: meta.resourceId || path.basename(filePath, '.jsonl'),
        version: meta.version || '',
        status: meta.status || '',
        licenseOrTerms: meta.licenseOrTerms || meta.license_or_terms || '',
      };
      return content
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => parseMarkerRecord(JSON.parse(line), resourcePath, resourceMeta))
        .filter((record): record is MarkerRecord => Boolean(record?.id));
    } catch {
      return [];
    }
  });

const scoreMarkerRecord = (record: MarkerRecord, query: string): { score: number; matchedFields: string[] } => {
  const queryText = normalized(query);
  const queryTokens = tokens(query);
  const fields: Array<[string, string | string[]]> = [
    ['id', record.id],
    ['context', record.context],
    ['compartment', record.compartment],
    ['major_type', record.major_type],
    ['subtype', record.subtype],
    ['state', record.state || ''],
    ['annotation_level', record.annotation_level],
    ['source_paper', record.source_paper],
    ['aliases', record.aliases],
    ['source_url', record.sourceUrl],
    ['evidence_type', record.evidenceType],
    ['evidence_location', record.evidenceLocation],
    ['confidence', record.confidence],
    ['markers.core', record.markers.core],
    ['markers.supporting', record.markers.supporting],
    ['markers.state', record.markers.state],
    ['exact_signature_genes', record.exactSignatureGenes],
  ];
  let score = 0;
  const matchedFields: string[] = [];
  for (const [name, value] of fields) {
    const fieldText = normalized(Array.isArray(value) ? value.join(' ') : value);
    if (!fieldText) continue;
    if (queryText && fieldText.includes(queryText)) {
      score += name.startsWith('markers.') ? 12 : 20;
      matchedFields.push(name);
      continue;
    }
    const tokenHits = queryTokens.filter((token) => fieldText.includes(token)).length;
    if (tokenHits) {
      score += tokenHits * (name.startsWith('markers.') ? 4 : 6);
      matchedFields.push(name);
    }
  }
  return { score, matchedFields: Array.from(new Set(matchedFields)) };
};

export const searchLocalMarkers = (
  query: string,
  options?: { species?: string; limit?: number; env?: NodeJS.ProcessEnv }
): MarkerSearchHit[] => {
  const roots = resolveKnowledgeResourceRoots(options?.env);
  const species = canonicalSpecies(options?.species || '');
  const limit = Math.max(1, Math.min(options?.limit || 25, 100));
  return readMarkerRecords(roots.markerRoot)
    .filter((record) => !species || markerRecordMatchesSpecies(record.species, species))
    .map((record) => ({ ...record, ...scoreMarkerRecord(record, query) }))
    .filter((record) => record.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);
};

const inferGeneSetSpecies = (filePath: string): 'human' | 'mouse' | 'unknown' => {
  const lowered = filePath.toLowerCase();
  if (lowered.includes('/human/') || lowered.includes('.hs.') || lowered.includes('_human')) return 'human';
  if (lowered.includes('/mouse/') || lowered.includes('.mm.') || lowered.includes('_mouse')) return 'mouse';
  return 'unknown';
};

export const canonicalSpecies = (value: string): 'human' | 'mouse' | '' => {
  const text = normalized(value);
  if (!text) return '';
  if (['human', 'homo sapiens', 'hs', 'h sapiens', '9606'].includes(text)) return 'human';
  if (['mouse', 'mus musculus', 'mm', 'm musculus', '10090'].includes(text)) return 'mouse';
  return '';
};

const markerRecordMatchesSpecies = (recordSpecies: string, requestedSpecies: 'human' | 'mouse'): boolean => {
  const text = normalized(recordSpecies);
  if (requestedSpecies === 'human') return /\bhuman\b|homo sapiens|9606/u.test(text);
  if (requestedSpecies === 'mouse') return /\bmouse\b|mus musculus|10090/u.test(text);
  return false;
};

const scoreGeneSet = (
  name: string,
  description: string,
  genes: string[],
  query: string
): { score: number; matchedFields: string[] } => {
  const queryText = normalized(query);
  const queryTokens = tokens(query);
  const fields: Array<[string, string]> = [
    ['name', name],
    ['description', description],
    ['genes', genes.join(' ')],
  ];
  let score = 0;
  const matchedFields: string[] = [];
  for (const [field, value] of fields) {
    const fieldText = normalized(value);
    if (fieldText.includes(queryText)) {
      score += field === 'genes' ? 8 : 30;
      matchedFields.push(field);
      continue;
    }
    const tokenHits = queryTokens.filter((token) => fieldText.includes(token)).length;
    if (tokenHits) {
      score += tokenHits * (field === 'genes' ? 2 : 8);
      matchedFields.push(field);
    }
  }
  return { score, matchedFields: Array.from(new Set(matchedFields)) };
};

const readGmtMatches = (
  filePath: string,
  query: string,
  provider: GeneSetHit['provider'],
  limit: number
): GeneSetHit[] => {
  const collection = path.basename(filePath);
  const species = inferGeneSetSpecies(filePath);
  const resourcePath = displayPath(filePath);
  const hits: GeneSetHit[] = [];
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return hits;
  }
  for (const line of content.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const [name = '', description = '', ...genes] = line.split('\t');
    const scored = scoreGeneSet(name, description, genes, query);
    if (scored.score <= 0) continue;
    hits.push({
      name,
      description,
      genes,
      geneCount: genes.length,
      collection,
      species,
      provider,
      resourcePath,
      score: scored.score,
      matchedFields: scored.matchedFields,
    });
    hits.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
    if (hits.length > limit * 5) hits.length = limit * 5;
  }
  return hits;
};

export const resolveLocalGeneSets = (
  query: string,
  options?: { species?: string; limit?: number; env?: NodeJS.ProcessEnv }
): GeneSetHit[] => {
  const roots = resolveKnowledgeResourceRoots(options?.env);
  const species = canonicalSpecies(options?.species || '');
  const limit = Math.max(1, Math.min(options?.limit || 25, 100));
  const msigdbFiles = listFiles(roots.msigdbRoot, ['.gmt'])
    .filter((filePath) => !species || inferGeneSetSpecies(filePath) === species)
    .sort();
  const compactFiles = listFiles(roots.geneSetRoot, ['.gmt'], { excludeDirNames: ['msigdb'] })
    .filter((filePath) => !species || inferGeneSetSpecies(filePath) === species || inferGeneSetSpecies(filePath) === 'unknown')
    .sort();
  const searchFiles =
    msigdbFiles.length > 0
      ? msigdbFiles.map((filePath) => ({ filePath, provider: 'msigdb' as const }))
      : compactFiles.map((filePath) => ({ filePath, provider: 'compact_fallback' as const }));
  return searchFiles
    .flatMap(({ filePath, provider }) => readGmtMatches(filePath, query, provider, limit))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, limit);
};
