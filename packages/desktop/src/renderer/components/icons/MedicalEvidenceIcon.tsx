/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

import adoptIcon from '@/renderer/assets/icons/generated/medical-evidence-adopt.png';
import adoptIconDark from '@/renderer/assets/icons/generated/medical-evidence-adopt-dark.png';
import anchorIcon from '@/renderer/assets/icons/generated/medical-evidence-anchor.png';
import anchorIconDark from '@/renderer/assets/icons/generated/medical-evidence-anchor-dark.png';
import basketIcon from '@/renderer/assets/icons/generated/medical-evidence-basket.png';
import basketIconDark from '@/renderer/assets/icons/generated/medical-evidence-basket-dark.png';
import citationIcon from '@/renderer/assets/icons/generated/medical-evidence-citation.png';
import citationIconDark from '@/renderer/assets/icons/generated/medical-evidence-citation-dark.png';
import completeIcon from '@/renderer/assets/icons/generated/medical-evidence-complete.png';
import completeIconDark from '@/renderer/assets/icons/generated/medical-evidence-complete-dark.png';
import downgradeIcon from '@/renderer/assets/icons/generated/medical-evidence-downgrade.png';
import downgradeIconDark from '@/renderer/assets/icons/generated/medical-evidence-downgrade-dark.png';
import drugLabelIcon from '@/renderer/assets/icons/generated/medical-evidence-drug-label.png';
import drugLabelIconDark from '@/renderer/assets/icons/generated/medical-evidence-drug-label-dark.png';
import gradeHighIcon from '@/renderer/assets/icons/generated/medical-evidence-grade-high.png';
import gradeHighIconDark from '@/renderer/assets/icons/generated/medical-evidence-grade-high-dark.png';
import gradeLowIcon from '@/renderer/assets/icons/generated/medical-evidence-grade-low.png';
import gradeLowIconDark from '@/renderer/assets/icons/generated/medical-evidence-grade-low-dark.png';
import gradeMidIcon from '@/renderer/assets/icons/generated/medical-evidence-grade-mid.png';
import gradeMidIconDark from '@/renderer/assets/icons/generated/medical-evidence-grade-mid-dark.png';
import guidelineIcon from '@/renderer/assets/icons/generated/medical-evidence-guideline.png';
import guidelineIconDark from '@/renderer/assets/icons/generated/medical-evidence-guideline-dark.png';
import paperIcon from '@/renderer/assets/icons/generated/medical-evidence-paper.png';
import paperIconDark from '@/renderer/assets/icons/generated/medical-evidence-paper-dark.png';
import picoIcon from '@/renderer/assets/icons/generated/medical-evidence-pico.png';
import picoIconDark from '@/renderer/assets/icons/generated/medical-evidence-pico-dark.png';
import rctIcon from '@/renderer/assets/icons/generated/medical-evidence-rct.png';
import rctIconDark from '@/renderer/assets/icons/generated/medical-evidence-rct-dark.png';
import regulatoryIcon from '@/renderer/assets/icons/generated/medical-evidence-regulatory.png';
import regulatoryIconDark from '@/renderer/assets/icons/generated/medical-evidence-regulatory-dark.png';
import reviewIcon from '@/renderer/assets/icons/generated/medical-evidence-review.png';
import reviewIconDark from '@/renderer/assets/icons/generated/medical-evidence-review-dark.png';
import scanIcon from '@/renderer/assets/icons/generated/medical-evidence-scan.png';
import scanIconDark from '@/renderer/assets/icons/generated/medical-evidence-scan-dark.png';
import searchIcon from '@/renderer/assets/icons/generated/medical-evidence-search.png';
import searchIconDark from '@/renderer/assets/icons/generated/medical-evidence-search-dark.png';
import trialIcon from '@/renderer/assets/icons/generated/medical-evidence-trial.png';
import trialIconDark from '@/renderer/assets/icons/generated/medical-evidence-trial-dark.png';
import weighIcon from '@/renderer/assets/icons/generated/medical-evidence-weigh.png';
import weighIconDark from '@/renderer/assets/icons/generated/medical-evidence-weigh-dark.png';

export type MedicalEvidenceIconName =
  | 'basket'
  | 'search'
  | 'paper'
  | 'guideline'
  | 'rct'
  | 'review'
  | 'drugLabel'
  | 'regulatory'
  | 'trial'
  | 'anchor'
  | 'gradeHigh'
  | 'gradeMid'
  | 'gradeLow'
  | 'weigh'
  | 'adopt'
  | 'downgrade'
  | 'pico'
  | 'scan'
  | 'citation'
  | 'complete';

type MedicalEvidenceIconProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> & {
  name: MedicalEvidenceIconName;
  size?: number | string;
  title?: string;
  visualScale?: number;
};

type IconAsset = {
  light: string;
  dark: string;
};

const ICON_ASSETS: Record<MedicalEvidenceIconName, IconAsset> = {
  basket: { light: basketIcon, dark: basketIconDark },
  search: { light: searchIcon, dark: searchIconDark },
  paper: { light: paperIcon, dark: paperIconDark },
  guideline: { light: guidelineIcon, dark: guidelineIconDark },
  rct: { light: rctIcon, dark: rctIconDark },
  review: { light: reviewIcon, dark: reviewIconDark },
  drugLabel: { light: drugLabelIcon, dark: drugLabelIconDark },
  regulatory: { light: regulatoryIcon, dark: regulatoryIconDark },
  trial: { light: trialIcon, dark: trialIconDark },
  anchor: { light: anchorIcon, dark: anchorIconDark },
  gradeHigh: { light: gradeHighIcon, dark: gradeHighIconDark },
  gradeMid: { light: gradeMidIcon, dark: gradeMidIconDark },
  gradeLow: { light: gradeLowIcon, dark: gradeLowIconDark },
  weigh: { light: weighIcon, dark: weighIconDark },
  adopt: { light: adoptIcon, dark: adoptIconDark },
  downgrade: { light: downgradeIcon, dark: downgradeIconDark },
  pico: { light: picoIcon, dark: picoIconDark },
  scan: { light: scanIcon, dark: scanIconDark },
  citation: { light: citationIcon, dark: citationIconDark },
  complete: { light: completeIcon, dark: completeIconDark },
};

const sizeToCss = (size: number | string): string =>
  typeof size === 'number' || /^\d+(\.\d+)?$/.test(size) ? `${size}px` : size;

const MedicalEvidenceIcon: React.FC<MedicalEvidenceIconProps> = ({
  name,
  size = 20,
  title,
  visualScale = 1,
  className,
  style,
  ...props
}) => {
  const asset = ICON_ASSETS[name] || ICON_ASSETS.paper;
  const cssSize = sizeToCss(size);
  const classes = ['medical-evidence-icon', className].filter(Boolean).join(' ');
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
      <img className='medical-evidence-icon__light' src={asset.light} alt='' draggable={false} style={imgStyle} />
      <img className='medical-evidence-icon__dark' src={asset.dark} alt='' draggable={false} style={imgStyle} />
    </span>
  );
};

export default MedicalEvidenceIcon;
