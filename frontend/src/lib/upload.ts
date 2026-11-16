import type { CreateFileInput, UploadTicket } from '@smart-reply/shared';
import { api, ApiError } from './api';

/** Upload a browser File: ask the API for a ticket, PUT the bytes, return the file id. */
export async function uploadFile(file: File | Blob, name: string, purpose: CreateFileInput['purpose'] = 'message'): Promise<string> {
  const mime = (file.type || 'application/octet-stream').split(';')[0];
  const ticket = await api.post<UploadTicket>('/files', { name, mime, sizeBytes: file.size, purpose });
  const res = await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: file, credentials: 'omit' });
  if (!res.ok) throw new ApiError(res.status, 'BAD_REQUEST', `Upload of “${name}” failed.`);
  return ticket.fileId;
}
