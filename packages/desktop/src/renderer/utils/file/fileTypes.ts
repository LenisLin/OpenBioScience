export type FileOrFolderItem = {
  path: string; // 绝对路径 / Absolute path
  name: string; // 文件名（可能被清理过用于显示）/ File name (may be cleaned for display)
  isFile: boolean; // 是否为文件 / Whether it is a file
  relativePath?: string; // 相对于工作空间的路径（用于发送给 Agent）/ Relative path to workspace (for sending to Agent)
  description?: string;
  badge?: string;
  group?: 'in_view' | 'project_artifact' | 'user_upload' | 'project_file' | 'other_project';
  kind?: 'file' | 'artifact' | 'science_report' | 'evidence';
  thumbnailPath?: string;
  science?: {
    artifactId?: string;
    artifactVersion?: number;
    evidenceIds?: string[];
    runId?: string;
  };
};
