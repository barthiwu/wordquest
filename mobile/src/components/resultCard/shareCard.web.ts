import html2canvas from 'html2canvas';

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/** Web: a plain "Download image" button next to Share. */
export const SUPPORTS_DOWNLOAD_BUTTON = true;

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

async function render(node: unknown): Promise<Blob> {
  const canvas = await html2canvas(node as HTMLElement, {
    scale: 3,
    useCORS: true,
    backgroundColor: null,
    logging: false,
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('render-failed'))), 'image/png');
  });
}

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadCardImage(
  node: unknown,
  opts: { fileName: string; title: string },
): Promise<ShareOutcome> {
  save(await render(node), opts.fileName);
  return 'downloaded';
}

/** Opens the browser's share sheet with the image when it can; otherwise downloads it. */
export async function shareCardImage(
  node: unknown,
  opts: { fileName: string; title: string },
): Promise<ShareOutcome> {
  const blob = await render(node);
  const file = new File(
    [blob],
    opts.fileName.endsWith('.png') ? opts.fileName : `${opts.fileName}.png`,
    {
      type: 'image/png',
    },
  );
  if (canShareFiles() && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: opts.title });
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
    }
  }
  save(blob, opts.fileName);
  return 'downloaded';
}
