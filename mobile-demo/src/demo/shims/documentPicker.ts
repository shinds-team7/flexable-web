/**
 * 시연판 expo-document-picker 대체. 브라우저 파일 선택 창(<input type="file">)으로 PDF 하나를 고른다.
 * 고른 파일은 목 서버로만 가고(실제 서버로 보내지 않음), 목 서버는 예시 결과만 돌려준다.
 */
export type DocumentPickerAsset = { uri: string; name: string; size?: number; mimeType?: string; file?: File };
export type DocumentPickerResult = { canceled: true; assets: null } | { canceled: false; assets: DocumentPickerAsset[] };

export function getDocumentAsync(options: { type?: string; copyToCacheDirectory?: boolean; multiple?: boolean } = {}): Promise<DocumentPickerResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options.type) input.accept = options.type;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve({ canceled: true, assets: null });
      resolve({ canceled: false, assets: [{ uri: URL.createObjectURL(file), name: file.name, size: file.size, mimeType: file.type, file }] });
    };
    input.oncancel = () => resolve({ canceled: true, assets: null });
    input.click();
  });
}
