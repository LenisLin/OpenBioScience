import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';
import { toLocalFileHref } from '@/renderer/components/Markdown/markdownUtils';
import { IconBook, IconCode, IconExperiment, IconFile, IconFileImage, IconStorage } from '@arco-design/web-react/icon';
import React from 'react';

type AtFileMenuProps = {
  activeIndex: number;
  emptyText: string;
  items: FileOrFolderItem[];
  label: string;
  loading: boolean;
  loadingText: string;
  onHoverItem: (index: number) => void;
  onSelectItem: (item: FileOrFolderItem) => void;
};

const GROUP_LABELS: Record<NonNullable<FileOrFolderItem['group']>, string> = {
  in_view: 'In view',
  user_upload: 'User uploads',
  project_artifact: 'Project artifacts',
  project_file: 'Project files',
  other_project: 'Other projects',
};

const renderIcon = (item: FileOrFolderItem) => {
  if (item.thumbnailPath) {
    return <img src={toLocalFileHref(item.thumbnailPath)} alt='' className='w-28px h-28px object-cover rd-6px' />;
  }
  if (item.kind === 'science_report') return <IconBook fontSize={16} />;
  if (item.kind === 'artifact') return <IconExperiment fontSize={16} />;
  if (/\.(png|jpe?g|gif|webp|svg|tiff?|bmp)$/iu.test(item.name || item.path)) return <IconFileImage fontSize={16} />;
  if (/\.(py|r|sh|ts|tsx|js|jsx|json|yaml|yml|tex|md)$/iu.test(item.name || item.path)) {
    return <IconCode fontSize={16} />;
  }
  if (/\.(csv|tsv|xlsx?|h5ad|parquet)$/iu.test(item.name || item.path)) return <IconStorage fontSize={16} />;
  return <IconFile fontSize={16} />;
};

const AtFileMenu: React.FC<AtFileMenuProps> = ({
  activeIndex,
  emptyText,
  items,
  label,
  loading,
  loadingText,
  onHoverItem,
  onSelectItem,
}) => {
  return (
    <div
      className='rounded-14px border border-solid overflow-hidden p-6px flex flex-col gap-2px'
      style={{
        borderColor: 'var(--color-border-2)',
        background: 'color-mix(in srgb, var(--color-bg-1) 94%, transparent)',
        backdropFilter: 'blur(14px) saturate(1.05)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.05)',
      }}
      role='listbox'
      aria-label={label}
    >
      {items.length === 0 ? (
        <div className='px-12px py-10px text-12px text-t-secondary'>{loading ? loadingText : emptyText}</div>
      ) : (
        items.map((item, index) => {
          const isActive = index === activeIndex;
          const previousGroup = items[index - 1]?.group;
          const shouldRenderGroup = item.group && item.group !== previousGroup;
          return (
            <React.Fragment key={`${item.path}-${item.kind || 'file'}-${index}`}>
              {shouldRenderGroup ? (
                <div className='px-10px pt-7px pb-3px text-11px font-600 text-t-tertiary'>
                  {GROUP_LABELS[item.group!] || item.group}
                </div>
              ) : null}
              <div
                role='option'
                aria-selected={isActive}
                className='px-10px py-8px rounded-10px cursor-pointer transition-colors flex items-center gap-10px min-w-0'
                style={{
                  background: isActive ? 'var(--color-fill-2)' : 'transparent',
                }}
                onMouseEnter={() => {
                  onHoverItem(index);
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelectItem(item);
                }}
              >
                <div
                  className='w-32px h-32px rd-8px flex items-center justify-center shrink-0 text-t-secondary overflow-hidden'
                  style={{ background: 'var(--color-fill-1)' }}
                >
                  {renderIcon(item)}
                </div>
                <div className='min-w-0 flex-1'>
                  <div className='text-13px font-medium text-t-primary truncate'>{item.name}</div>
                  <div className='text-12px text-t-secondary truncate'>{item.description || item.relativePath || item.path}</div>
                </div>
                {item.badge ? (
                  <div className='text-11px text-t-tertiary shrink-0 px-6px py-2px rd-999px bg-fill-1'>{item.badge}</div>
                ) : null}
              </div>
            </React.Fragment>
          );
        })
      )}
      {items.length > 0 ? (
        <div className='mt-3px px-10px py-6px text-11px text-t-tertiary b-t b-solid b-border-1'>
          ↑↓ navigate · Enter select · Esc close
        </div>
      ) : null}
    </div>
  );
};

export default AtFileMenu;
