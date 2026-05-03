export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: string;
}

export interface ThreadAnchor {
  text: string;
  contextBefore: string;
  contextAfter: string;
}

export interface Thread {
  id: string;
  file: string;
  line: number;
  anchor: ThreadAnchor;
  comments: Comment[];
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MarginData {
  version: number;
  threads: Thread[];
}
