/** Download a blob as a file. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Phones/tablets get the native share sheet (WhatsApp, Drive, …) like the mobile
 * app; desktops — or browsers that can't share files — get a normal download.
 */
export async function saveOrShareFile(blob: Blob, fileName: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], fileName, { type: blob.type });
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
      // Share failed for another reason — fall through to a download
    }
  }
  downloadBlob(blob, fileName);
  return 'downloaded';
}
