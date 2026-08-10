import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

export type PickedAttachment = {
  uri: string;
  mimeType: string;
  fileName: string | null;
  kind: 'image' | 'file';
};

export class AttachmentPermissionError extends Error {}

export async function pickImageFromCamera(): Promise<PickedAttachment | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new AttachmentPermissionError('Enable camera access in Settings to take a photo.');
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', fileName: asset.fileName ?? null, kind: 'image' };
}

export async function pickImageFromLibrary(): Promise<PickedAttachment | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new AttachmentPermissionError('Enable photo library access in Settings to choose a photo.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', fileName: asset.fileName ?? null, kind: 'image' };
}

export async function pickAnyFile(): Promise<PickedAttachment | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'application/octet-stream',
    fileName: asset.name,
    kind: 'file',
  };
}
