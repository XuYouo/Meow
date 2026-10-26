export interface SourceMemo {
  readonly sourceId: string;
  readonly content: string;
  readonly tags: string[];
  readonly pinned: boolean;
  readonly isPublic: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resourceIds: string[];
}
export interface SourceResource {
  readonly sourceResourceId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly size: number | null;
  readonly sourceMemoIds: string[];
}
export interface MemosSource {
  readonly memos: SourceMemo[];
  readonly resources: SourceResource[];
  readonly archivedExcluded: number;
  readonly warnings: string[];
}
