/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface CsvTableViewerProps {
  content: string;
  fileName?: string;
}

const MAX_PREVIEW_ROWS = 500;
const MAX_PREVIEW_COLUMNS = 80;

const parseDelimitedRows = (content: string, delimiter: ',' | '\t'): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((item) => item.some((cellValue) => cellValue.trim() !== ''));
};

const CsvTableViewer: React.FC<CsvTableViewerProps> = ({ content, fileName }) => {
  const { t } = useTranslation();
  const delimiter = fileName?.toLowerCase().endsWith('.tsv') ? '\t' : ',';
  const rows = useMemo(() => parseDelimitedRows(content || '', delimiter).slice(0, MAX_PREVIEW_ROWS), [content, delimiter]);
  const headers = rows[0] || [];
  const bodyRows = rows.slice(1);
  const visibleHeaders = headers.slice(0, MAX_PREVIEW_COLUMNS);

  if (!rows.length) {
    return (
      <div className='csv-preview csv-preview--empty'>
        {t('preview.csv.empty', { defaultValue: 'No rows to preview' })}
      </div>
    );
  }

  return (
    <div className='csv-preview'>
      <table className='csv-preview__table'>
        <thead>
          <tr>
            {visibleHeaders.map((header, index) => (
              <th key={`${header}-${index}`}>{header || t('preview.csv.column', { count: index + 1, defaultValue: 'Column {{count}}' })}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {visibleHeaders.map((_, columnIndex) => (
                <td key={columnIndex}>{row[columnIndex] || ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {(rows.length >= MAX_PREVIEW_ROWS || headers.length > MAX_PREVIEW_COLUMNS) && (
        <div className='csv-preview__note'>
          {t('preview.csv.truncated', {
            rows: MAX_PREVIEW_ROWS,
            columns: MAX_PREVIEW_COLUMNS,
            defaultValue: 'Showing the first {{rows}} rows and {{columns}} columns.',
          })}
        </div>
      )}
    </div>
  );
};

export default CsvTableViewer;
