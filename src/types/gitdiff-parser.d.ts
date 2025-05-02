// Type definitions for gitdiff-parser
declare module "gitdiff-parser" {
  export type ChangeType = "insert" | "delete" | "normal";

  export interface InsertChange {
    type: "insert";
    content: string;
    lineNumber: number;
    isInsert: true;
  }

  export interface DeleteChange {
    type: "delete";
    content: string;
    lineNumber: number;
    isDelete: true;
  }

  export interface NormalChange {
    type: "normal";
    content: string;
    isNormal: true;
    oldLineNumber: number;
    newLineNumber: number;
  }

  export type Change = InsertChange | DeleteChange | NormalChange;

  export interface Hunk {
    content: string;
    oldStart: number;
    newStart: number;
    oldLines: number;
    newLines: number;
    changes: Change[];
  }

  export type FileType = "add" | "delete" | "modify" | "rename" | "copy";

  export interface File {
    hunks: Hunk[];
    oldEndingNewLine: boolean;
    newEndingNewLine: boolean;
    oldMode: string;
    newMode: string;
    similarity?: number;
    oldRevision: string;
    newRevision: string;
    oldPath: string;
    newPath: string;
    isBinary?: boolean;
    type: FileType;
  }

  /**
   * Parse a git diff string into a structured format
   * @param diffStr Raw git diff string
   * @returns Array of File objects representing the parsed diff
   */
  export function parse(diffStr: string): File[];

  // Export as ES module default export
  const _default: {
    parse(source: string): File[];
  };
  export default _default;
}
