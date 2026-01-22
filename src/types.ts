export interface Message {
  id: string;
  author: string;
  createdAt: string;
  body: string;
  editedAt?: string;
}

export interface Anchor {
  filePath: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  prefixContext: string;
  suffixContext: string;
}

export type ThreadStatus = 'open' | 'resolved' | 'orphaned';

export interface CommentThread {
  id: string;
  filePath: string;
  anchor: Anchor;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  messages: Message[];
}

export interface ReviewCommentsData {
  schemaVersion: number;
  threads: CommentThread[];
}
