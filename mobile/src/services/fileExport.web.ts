export type FileExportOutcome = 'shared' | 'downloaded';

export interface FileExportOptions {
  bytes: ArrayBuffer;
  fileName: string;
  mimeType: string;
  uti?: string;
  title: string;
}

/** Web: saves the file through the browser's normal download. */
export async function exportFile(opts: FileExportOptions): Promise<FileExportOutcome> {
  const blob = new Blob([opts.bytes], { type: opts.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
