/**
 * Customers (contacts): list with filters, create, CSV import, owner changes, owner history,
 * starting a chat with a template, and the CSV export.
 */
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  Contact,
  ContactImportResult,
  Conversation,
  CreateContactInput,
  ExportResponse,
  OwnerHistoryEntry,
  Page
} from '@smart-reply/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';

export interface ContactFilters {
  search?: string;
  /** A user id, `none` (no owner) or `me`. */
  owner?: string;
  label?: string;
}

export interface ImportRow {
  name: string;
  phone: string;
  city?: string;
  ownerEmail?: string;
  labels?: string[];
}

/** Keys live under `qk.contacts`, so every invalidation of `qk.contacts` refreshes them too. */
export const contactKeys = {
  list: (f: ContactFilters) => [...qk.contacts, 'list', f.search ?? '', f.owner ?? '', f.label ?? ''] as const,
  one: (id: string) => [...qk.contacts, 'one', id] as const
};

const PAGE = 200;

function refreshContacts(qc: QueryClient, id?: string): void {
  void qc.invalidateQueries({ queryKey: qk.contacts });
  void qc.invalidateQueries({ queryKey: qk.conversationsAll });
  void qc.invalidateQueries({ queryKey: qk.labels });
  if (id) void qc.invalidateQueries({ queryKey: qk.contactHistory(id) });
}

export function useContactList(f: ContactFilters) {
  return useInfiniteQuery({
    queryKey: contactKeys.list(f),
    initialPageParam: null as string | null,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) =>
      api.get<Page<Contact>>('/contacts', { search: f.search, owner: f.owner, label: f.label, cursor: pageParam, limit: PAGE }),
    getNextPageParam: last => last.nextCursor
  });
}

export function useContact(id: string | null) {
  return useQuery({
    queryKey: contactKeys.one(id ?? 'none'),
    enabled: Boolean(id),
    queryFn: () => api.get<Contact>(`/contacts/${id}`)
  });
}

export function useOwnerHistory(id: string | null) {
  return useQuery({
    queryKey: qk.contactHistory(id ?? 'none'),
    enabled: Boolean(id),
    queryFn: () => api.get<OwnerHistoryEntry[]>(`/contacts/${id}/owner-history`)
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContactInput) => api.post<Contact>('/contacts', input),
    onSuccess: () => refreshContacts(qc)
  });
}

export function useImportContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: ImportRow[]) => api.post<ContactImportResult>('/contacts/import', { rows }),
    onSuccess: () => refreshContacts(qc)
  });
}

export function useSetContactOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ownerUserId, reason = '' }: { id: string; ownerUserId: string | null; reason?: string }) =>
      api.put<Contact>(`/contacts/${id}/owner`, { ownerUserId, reason }),
    onSuccess: (_c, vars) => {
      refreshContacts(qc, vars.id);
      void qc.invalidateQueries({ queryKey: qk.staff });
    }
  });
}

export function useBulkOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contactIds, ownerUserId, reason = '' }: { contactIds: string[]; ownerUserId: string | null; reason?: string }) =>
      api.post<{ changed: number }>('/contacts/bulk/owner', { contactIds, ownerUserId, reason }),
    onSuccess: (_r, vars) => {
      refreshContacts(qc);
      for (const id of vars.contactIds) void qc.invalidateQueries({ queryKey: qk.contactHistory(id) });
      void qc.invalidateQueries({ queryKey: qk.staff });
    }
  });
}

/** Start (or reopen) a chat outside the 24-hour window by sending an approved template. */
export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { contactId: string; templateId: string; variables: string[] }) => api.post<Conversation>('/conversations', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.conversationsAll });
      void qc.invalidateQueries({ queryKey: qk.counts });
    }
  });
}

export function useExportContacts() {
  return useMutation({
    mutationFn: () => api.post<ExportResponse>('/exports', { kind: 'contacts', format: 'csv', params: {} })
  });
}

/* ───────── CSV ───────── */

/** Split CSV text into rows of cells (RFC 4180 quotes, CRLF or LF line ends). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

const HEADERS: Record<keyof ImportRow, string[]> = {
  name: ['name', 'customer', 'full name', 'customer name'],
  phone: ['phone', 'number', 'mobile', 'whatsapp', 'phone number', 'whatsapp number'],
  city: ['city', 'town'],
  ownerEmail: ['owner', 'owner email', 'owneremail', 'staff', 'staff email'],
  labels: ['labels', 'label', 'tags']
};

/**
 * Turn CSV text into import rows. The first row is a header when it names a `name` and a
 * `phone`/`number` column; otherwise columns are read as name, number, city, owner email, labels.
 * Labels in one cell are separated by `;` or `|`.
 */
export function csvToImportRows(text: string): { rows: ImportRow[]; problems: string[] } {
  const cells = parseCsv(text);
  const problems: string[] = [];
  if (!cells.length) return { rows: [], problems: ['The file is empty.'] };
  const head = cells[0].map(h => h.trim().toLowerCase());
  const find = (k: keyof ImportRow) => head.findIndex(h => HEADERS[k].includes(h));
  const hasHeader = find('name') >= 0 && find('phone') >= 0;
  const col: Record<keyof ImportRow, number> = hasHeader
    ? { name: find('name'), phone: find('phone'), city: find('city'), ownerEmail: find('ownerEmail'), labels: find('labels') }
    : { name: 0, phone: 1, city: 2, ownerEmail: 3, labels: 4 };
  const body = hasHeader ? cells.slice(1) : cells;
  const rows: ImportRow[] = [];
  body.forEach((r, i) => {
    const get = (k: keyof ImportRow) => (col[k] >= 0 ? (r[col[k]] ?? '').trim() : '');
    const name = get('name');
    const phone = get('phone');
    const line = i + (hasHeader ? 2 : 1);
    if (!name || !phone) {
      problems.push(`Line ${line}: needs a name and a number.`);
      return;
    }
    const row: ImportRow = { name: name.slice(0, 80), phone };
    const city = get('city');
    if (city) row.city = city.slice(0, 60);
    const owner = get('ownerEmail');
    if (owner) row.ownerEmail = owner.toLowerCase();
    const labels = get('labels')
      .split(/[;|]/)
      .map(l => l.trim())
      .filter(Boolean);
    if (labels.length) row.labels = labels.slice(0, 20);
    rows.push(row);
  });
  return { rows, problems };
}
