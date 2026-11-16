import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Contact, OwnerHistoryEntry } from '@smart-reply/shared';
import { api, asItems } from '@/lib/api';
import { updateContactInConversations, updateContactInList, type Pages } from '@/realtime/cache';
import type { Conversation } from '@smart-reply/shared';
import type { QueryClient } from '@tanstack/react-query';
import { qk } from '../keys';
import { usePaged } from '../paged';

export function useContactList(search: string, owner: '' | 'me' | 'none') {
  return usePaged<Contact>(qk.contactList(search, owner), '/contacts', { search: search || undefined, owner: owner || undefined });
}

export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: qk.contact(id ?? ''),
    queryFn: ({ signal }) => api.get<Contact>(`/contacts/${id}`, undefined, signal),
    enabled: !!id
  });
}

/** Puts a changed contact into every cached place it appears. */
export function storeContact(qc: QueryClient, contact: Contact): void {
  qc.setQueryData(qk.contact(contact.id), contact);
  qc.setQueriesData<Pages<Contact>>({ queryKey: qk.contacts }, d => updateContactInList(d, contact));
  qc.setQueriesData<Pages<Conversation>>({ queryKey: qk.conversations }, d => updateContactInConversations(d, contact));
  qc.setQueriesData<Conversation>({ queryKey: ['conversation'] }, c => (c && c.contactId === contact.id ? { ...c, contact } : c));
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; phone: string; city: string }) => api.post<Contact>('/contacts', body),
    onSuccess: c => {
      qc.setQueryData(qk.contact(c.id), c);
      void qc.invalidateQueries({ queryKey: qk.contacts });
    }
  });
}

export function useOwnerHistory(contactId: string | undefined) {
  return useQuery({
    queryKey: qk.ownerHistory(contactId ?? ''),
    queryFn: async ({ signal }) =>
      asItems(await api.get<OwnerHistoryEntry[] | { items: OwnerHistoryEntry[] }>(`/contacts/${contactId}/owner-history`, undefined, signal)),
    enabled: !!contactId
  });
}

export function useSetOwner(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ownerUserId: string | null; reason: string }) => api.put<Contact | undefined>(`/contacts/${contactId}/owner`, body),
    onSuccess: c => {
      if (c && typeof c === 'object' && 'id' in c) storeContact(qc, c);
      void qc.invalidateQueries({ queryKey: qk.contact(contactId) });
      void qc.invalidateQueries({ queryKey: qk.ownerHistory(contactId) });
      void qc.invalidateQueries({ queryKey: qk.conversations });
    }
  });
}

export function useSetBlocked(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blocked: boolean) =>
      blocked ? api.post<Contact | undefined>(`/contacts/${contactId}/block`) : api.del<Contact | undefined>(`/contacts/${contactId}/block`),
    onSuccess: c => {
      if (c && typeof c === 'object' && 'id' in c) storeContact(qc, c);
      void qc.invalidateQueries({ queryKey: qk.contact(contactId) });
    }
  });
}

export function useRequestCallPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) => api.post<unknown>(`/contacts/${contactId}/call-permission-request`),
    onSuccess: (_r, contactId) => void qc.invalidateQueries({ queryKey: qk.contact(contactId) })
  });
}
