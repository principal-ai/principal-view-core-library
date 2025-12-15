import * as path from 'path';
import { SourceLocation } from './types';

/**
 * Captures source location information from stack traces
 */
export class SourceCapture {
  private projectRoot: string;

  constructor(projectRoot?: string) {
    // Default to current working directory if not specified
    this.projectRoot = projectRoot || process.cwd();
  }

  /**
   * Capture the source location of the caller
   * @param skipFrames Number of stack frames to skip (default: 2 to skip Error and captureSource)
   * @returns Source location or undefined if capture fails
   */
  public capture(skipFrames: number = 2): SourceLocation | undefined {
    // Capture stack trace
    const originalPrepareStackTrace = Error.prepareStackTrace;

    try {
      Error.prepareStackTrace = (_, stack) => stack;
      const stack = new Error().stack as unknown as NodeJS.CallSite[];

      if (!stack || stack.length <= skipFrames) {
        return undefined;
      }

      // Get the caller's frame (skip internal frames)
      const frame = stack[skipFrames];

      if (!frame) {
        return undefined;
      }

      const fileName = frame.getFileName();

      if (!fileName) {
        return undefined;
      }

      // Normalize the file path to be relative to project root
      const relativePath = this.normalizePath(fileName);

      // Filter out node_modules and internal Node.js files
      if (this.shouldIgnorePath(relativePath)) {
        return undefined;
      }

      return {
        file: relativePath,
        line: frame.getLineNumber() || undefined,
        column: frame.getColumnNumber() || undefined,
        functionName: frame.getFunctionName() || undefined,
      };
    } catch (error) {
      // Source capture failed, return undefined
      return undefined;
    } finally {
      Error.prepareStackTrace = originalPrepareStackTrace;
    }
  }

  /**
   * Normalize an absolute path to be relative to project root
   */
  private normalizePath(absolutePath: string): string {
    // Handle file:// URLs (common in ESM modules)
    if (absolutePath.startsWith('file://')) {
      absolutePath = absolutePath.substring(7);
    }

    // Make path relative to project root
    let relativePath = path.relative(this.projectRoot, absolutePath);

    // If path goes outside project root, use basename
    if (relativePath.startsWith('..')) {
      relativePath = path.basename(absolutePath);
    }

    // Normalize path separators to forward slashes
    return relativePath.replace(/\\/g, '/');
  }

  /**
   * Check if a path should be ignored (node_modules, internal Node.js, etc.)
   */
  private shouldIgnorePath(relativePath: string): boolean {
    return (
      relativePath.includes('node_modules') ||
      relativePath.startsWith('internal/') ||
      relativePath.startsWith('node:')
    );
  }

  /**
   * Parse a stack trace string into source locations
   * Useful for parsing stack traces from error objects
   */
  public parseStackTrace(stackTrace: string): SourceLocation[] {
    const lines = stackTrace.split('\n');
    const locations: SourceLocation[] = [];

    // Stack trace format: "    at functionName (file:line:column)"
    const stackLineRegex = /at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/;

    for (const line of lines) {
      const match = line.match(stackLineRegex);
      if (match) {
        const [, functionName, file, lineNum, columnNum] = match;
        const relativePath = this.normalizePath(file);

        if (!this.shouldIgnorePath(relativePath)) {
          locations.push({
            file: relativePath,
            line: parseInt(lineNum, 10),
            column: parseInt(columnNum, 10),
            functionName: functionName?.trim(),
          });
        }
      }
    }

    return locations;
  }
}
