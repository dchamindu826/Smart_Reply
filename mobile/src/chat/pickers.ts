import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { MEDIA_LIMITS } from '@smart-reply/shared';
import { guessMime, type LocalFile } from '@/lib/upload';

const PHOTO_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.8,
  exif: false,
  // Ask iOS for a JPEG instead of HEIC, which WhatsApp refuses.
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible
};

function fromAsset(a: ImagePicker.ImagePickerAsset): LocalFile {
  const name = a.fileName ?? `photo-${Date.now()}.jpg`;
  return { uri: a.uri, name, mime: guessMime(name, a.mimeType), size: a.fileSize ?? null };
}

export async function pickPhoto(): Promise<LocalFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Allow access to your photos in your phone settings to send pictures.');
  const res = await ImagePicker.launchImageLibraryAsync(PHOTO_OPTIONS);
  const a = res.canceled ? undefined : res.assets[0];
  return a ? fromAsset(a) : null;
}

export async function takePhoto(): Promise<LocalFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Allow camera access in your phone settings to take photos.');
  const res = await ImagePicker.launchCameraAsync(PHOTO_OPTIONS);
  const a = res.canceled ? undefined : res.assets[0];
  return a ? fromAsset(a) : null;
}

export async function pickDocument(): Promise<LocalFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: [...MEDIA_LIMITS.document.mimes, ...MEDIA_LIMITS.image.mimes, ...MEDIA_LIMITS.video.mimes, ...MEDIA_LIMITS.audio.mimes],
    copyToCacheDirectory: true,
    multiple: false
  });
  const a = res.canceled ? undefined : res.assets[0];
  return a ? { uri: a.uri, name: a.name, mime: guessMime(a.name, a.mimeType), size: a.size ?? null } : null;
}
