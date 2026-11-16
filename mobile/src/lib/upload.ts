import { getInfoAsync, uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { MEDIA_LIMITS, mediaKindForMime, type CreateFileInput, type MediaKind, type UploadTicket } from '@smart-reply/shared';
import { api } from './api';
import { ApiError } from './errors';
import { reachableUrl } from './urls';

export interface LocalFile {
  uri: string;
  name: string;
  mime: string;
  size?: number | null;
}

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};

/** The MIME type reported by the picker, or one guessed from the file name. */
export function guessMime(name: string, reported?: string | null): string {
  if (reported && reported !== 'application/octet-stream') return reported === 'image/jpg' ? 'image/jpeg' : reported;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Throws a user-facing error when WhatsApp would refuse the file. */
export function checkSendable(mime: string, size: number): MediaKind {
  const kind = mediaKindForMime(mime);
  if (!kind) throw new ApiError('FILE_TYPE_NOT_ALLOWED', 'WhatsApp does not accept this type of file.', 0);
  const max = MEDIA_LIMITS[kind].max;
  if (size > max) throw new ApiError('FILE_TOO_LARGE', `This file is too large. The limit is ${formatBytes(max)}.`, 0);
  return kind;
}

async function sizeOf(file: LocalFile): Promise<number> {
  if (file.size && file.size > 0) return file.size;
  const info = await getInfoAsync(file.uri);
  return info.exists ? info.size : 0;
}

/** Asks the API for an upload ticket, PUTs the bytes, and returns the file id to reference. */
export async function uploadFile(file: LocalFile, purpose: CreateFileInput['purpose'] = 'message'): Promise<string> {
  const size = await sizeOf(file);
  if (size <= 0) throw new ApiError('BAD_REQUEST', 'The file is empty.', 0);
  checkSendable(file.mime, size);
  const ticket = await api.post<UploadTicket>('/files', { name: file.name, mime: file.mime, sizeBytes: size, purpose });
  let status = 0;
  try {
    const res = await uploadAsync(reachableUrl(ticket.uploadUrl), file.uri, {
      httpMethod: ticket.uploadMethod ?? 'PUT',
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': file.mime, ...ticket.headers }
    });
    status = res.status;
  } catch {
    throw new ApiError('NETWORK', 'The upload did not finish. Check your connection.', 0);
  }
  if (status < 200 || status >= 300) throw new ApiError('INTERNAL', `The upload failed (${status}).`, status);
  return ticket.fileId;
}
