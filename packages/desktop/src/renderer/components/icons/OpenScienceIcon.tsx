/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const ICON_FILE_STEMS = {
  artifact: 'artifact',
  artifactAlignment: 'artifact-alignment',
  artifactCode: 'artifact-code',
  artifactDataset: 'artifact-dataset',
  artifactEnvironment: 'artifact-environment',
  artifactExport: 'artifact-export',
  artifactFigure: 'artifact-figure',
  artifactGenomeTrack: 'artifact-genome-track',
  artifactHtml: 'artifact-html',
  artifactInputs: 'artifact-inputs',
  artifactLatex: 'artifact-latex',
  artifactLog: 'artifact-log',
  artifactManuscript: 'artifact-manuscript',
  artifactMessages: 'artifact-messages',
  artifactMolecule: 'artifact-molecule',
  artifactNotebook: 'artifact-notebook',
  artifactPdf: 'artifact-pdf',
  artifactProtein: 'artifact-protein',
  artifactProvenance: 'artifact-provenance',
  artifactReview: 'artifact-review',
  artifactRunBundle: 'artifact-run-bundle',
  artifactTable: 'artifact-table',
  artifactVersion: 'artifact-version',
  connectorChemDb: 'connector-chem-db',
  connectorGenomicsDb: 'connector-genomics-db',
  connectorLiterature: 'connector-literature',
  connectorProteinDb: 'connector-protein-db',
  depositionEnable: 'deposition-enable',
  depositionProtocol: 'deposition-protocol',
  depositionReport: 'deposition-report',
  depositionRevise: 'deposition-revise',
  depositionSkill: 'deposition-skill',
  depositionSop: 'deposition-sop',
  depositionSourceMap: 'deposition-source-map',
  depositionUpdate: 'deposition-update',
  gpuRun: 'gpu-run',
  hpcQueue: 'hpc-queue',
  modeDeposition: 'mode-deposition',
  modeGoal: 'mode-goal',
  modeMedicalEvidence: 'mode-medical-evidence',
  modeScience: 'mode-science',
  newProject: 'new-project',
  remoteJob: 'remote-job',
  researchProject: 'research-project',
  reviewFailed: 'review-failed',
  reviewPassed: 'review-passed',
  reviewWarning: 'review-warning',
  reviewerAgent: 'reviewer-agent',
  scienceClaim: 'science-claim',
  scienceComputed: 'science-computed',
  scienceDigitized: 'science-digitized',
  scienceEvidence: 'science-evidence',
  scienceHypothesis: 'science-hypothesis',
  scienceMethods: 'science-methods',
  scienceParsed: 'science-parsed',
  scienceReport: 'science-report',
  scienceSummary: 'science-summary',
  scienceValidation: 'science-validation',
  scienceWarning: 'science-warning',
  settingsAppearance: 'settings-appearance',
  settingsArtifact: 'settings-artifact',
  settingsDatasource: 'settings-datasource',
  settingsMcp: 'settings-mcp',
  settingsMedical: 'settings-medical',
  settingsMotion: 'settings-motion',
  settingsPaperclipApi: 'settings-paperclip-api',
  settingsPermission: 'settings-permission',
  settingsScience: 'settings-science',
  settingsSkills: 'settings-skills',
} as const;

export type OpenScienceIconName = keyof typeof ICON_FILE_STEMS;

type OpenScienceIconProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> & {
  name: OpenScienceIconName;
  size?: number | string;
  title?: string;
  visualScale?: number;
};

const sizeToCss = (size: number | string): string =>
  typeof size === 'number' || /^\d+(\.\d+)?$/.test(size) ? `${size}px` : size;

const resolveAsset = (stem: string, dark = false): string =>
  new URL(`../../assets/icons/generated/openscience/${stem}${dark ? '-dark' : ''}.png`, import.meta.url).href;

const OpenScienceIcon: React.FC<OpenScienceIconProps> = ({
  name,
  size = 20,
  title,
  visualScale = 1,
  className,
  style,
  ...props
}) => {
  const stem = ICON_FILE_STEMS[name] || ICON_FILE_STEMS.artifact;
  const cssSize = sizeToCss(size);
  const classes = ['openscience-icon', className].filter(Boolean).join(' ');
  const imgStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    pointerEvents: 'none',
    transform: `scale(${visualScale})`,
    transformOrigin: 'center',
  };

  return (
    <span
      className={classes}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      title={title}
      style={{
        display: 'inline-flex',
        width: cssSize,
        height: cssSize,
        minWidth: cssSize,
        minHeight: cssSize,
        lineHeight: 0,
        overflow: 'visible',
        verticalAlign: '-0.125em',
        ...style,
      }}
      {...props}
    >
      <img className='openscience-icon__light' src={resolveAsset(stem)} alt='' draggable={false} style={imgStyle} />
      <img
        className='openscience-icon__dark'
        src={resolveAsset(stem, true)}
        alt=''
        draggable={false}
        style={imgStyle}
      />
    </span>
  );
};

export default OpenScienceIcon;
