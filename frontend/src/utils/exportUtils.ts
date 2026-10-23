export function isClipboardAvailable(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  return Boolean(navigator.clipboard) && window.isSecureContext === true;
}

export function downloadMarkdown(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const anchor = document.createElement('a');
  let url: string | undefined;
  try {
    url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    const revokeUrl = url;
    // Deferred: Safari and older Firefox cancel the download if the URL dies synchronously.
    if (revokeUrl) setTimeout(() => URL.revokeObjectURL(revokeUrl), 0);
  }
}
