/**
 * Data hooks for the content screens: templates, catalog, broadcasts, quick replies and the
 * media gallery. The query keys are the shared ones in `qk`, so AppContext (which reads the same
 * caches for the chat composer) refreshes too.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Broadcast,
  Contact,
  CreateFileInput,
  CreateTemplateInput,
  MediaCategory,
  MediaItem,
  Page,
  Product,
  ProductCollection,
  ProductInput,
  QuickReply,
  Template
} from '@smart-reply/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { uploadFile } from '@/lib/upload';

/* ───────── Templates ───────── */

export function useTemplates() {
  return useQuery({ queryKey: qk.templates, queryFn: () => api.get<Template[]>('/templates') });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: (readonly unknown[])[]) => Promise.all(keys.map(queryKey => qc.invalidateQueries({ queryKey })));
}

export function useCreateTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) => api.post<Template>('/templates', input),
    onSuccess: () => invalidate(qk.templates)
  });
}

export function useResubmitTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post<Template>(`/templates/${id}/resubmit`),
    onSuccess: () => invalidate(qk.templates)
  });
}

export function useDeleteTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/templates/${id}`),
    onSuccess: () => invalidate(qk.templates)
  });
}

export function useSyncTemplates() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api.post<{ updated: number }>('/templates/sync'),
    onSuccess: () => invalidate(qk.templates)
  });
}

/* ───────── Catalog ───────── */

export function useCollections() {
  return useQuery({ queryKey: qk.collections, queryFn: () => api.get<ProductCollection[]>('/catalog/collections') });
}

export function useProducts() {
  return useQuery({ queryKey: qk.products, queryFn: () => api.get<Product[]>('/catalog/products') });
}

export function useSaveCollection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, name, position }: { id?: string; name: string; position?: number }) =>
      id
        ? api.patch<ProductCollection>(`/catalog/collections/${id}`, { name, ...(position !== undefined ? { position } : {}) })
        : api.post<ProductCollection>('/catalog/collections', { name, position: position ?? 0 }),
    onSuccess: () => invalidate(qk.collections, qk.products)
  });
}

export function useDeleteCollection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/catalog/collections/${id}`),
    onSuccess: () => invalidate(qk.collections, qk.products)
  });
}

export interface ProductDraft {
  id?: string;
  /** Fields to send. Staff with "edit prices" send only priceMinor / oldPriceMinor. */
  fields: Partial<ProductInput>;
  /** A new photo to upload first (purpose `product`). */
  photo?: File | null;
}

export function useSaveProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, fields, photo }: ProductDraft) => {
      const body: Partial<ProductInput> = { ...fields };
      if (photo) body.imageFileId = await uploadFile(photo, photo.name, 'product');
      return id ? api.patch<Product>(`/catalog/products/${id}`, body) : api.post<Product>('/catalog/products', body);
    },
    onSuccess: () => invalidate(qk.products, qk.collections)
  });
}

export function useDeleteProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/catalog/products/${id}`),
    onSuccess: () => invalidate(qk.products, qk.collections)
  });
}

/* ───────── Broadcasts ───────── */

export const broadcastsKey = ['broadcasts'] as const;

export function useBroadcasts(enabled = true) {
  return useQuery({
    queryKey: broadcastsKey,
    enabled,
    queryFn: () => api.get<Broadcast[]>('/broadcasts'),
    // Socket `broadcast.progress` invalidates this key; poll gently while one is sending as a fallback.
    refetchInterval: q => (q.state.data?.some(b => b.status === 'sending') ? 10_000 : false)
  });
}

export interface BroadcastInput {
  name: string;
  labelId: string | null;
  templateId: string;
  variables: string[];
  scheduledAt: string | null;
}

export function useCreateBroadcast() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: BroadcastInput) => api.post<Broadcast>('/broadcasts', input),
    onSuccess: () => invalidate(broadcastsKey)
  });
}

export function useSendBroadcast() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post<Broadcast>(`/broadcasts/${id}/send`),
    onSettled: () => invalidate(broadcastsKey)
  });
}

export function useCancelBroadcast() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post<Broadcast>(`/broadcasts/${id}/cancel`),
    onSuccess: () => invalidate(broadcastsKey)
  });
}

const PREVIEW_PAGE = 200;

/**
 * How many customers a broadcast would reach: opted in to marketing, not blocked, reachable on
 * WhatsApp, and (when a label is picked) carrying that label. The API has no count endpoint, so
 * this reads up to one page of contacts; `more` is true when there are further pages.
 */
export function useAudiencePreview(labelId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['broadcast-audience', labelId ?? 'all'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const page = await api.get<Page<Contact>>('/contacts', { label: labelId ?? undefined, limit: PREVIEW_PAGE });
      const count = page.items.filter(c => c.marketingOptIn && !c.blocked && (c.waId || c.username)).length;
      return { count, more: Boolean(page.nextCursor) };
    }
  });
}

/* ───────── Quick replies ───────── */

export function useQuickReplies() {
  return useQuery({ queryKey: qk.quickReplies, queryFn: () => api.get<QuickReply[]>('/quick-replies') });
}

export interface QuickReplyDraft {
  id?: string;
  command: string;
  title: string;
  text: string;
  scope: 'everyone' | 'only_me';
  /** Files already on the server keep their id; new ones are uploaded first. */
  attachments: { fileId?: string; file?: File; name: string }[];
}

async function fileIdsOf(list: { fileId?: string; file?: File; name: string }[], purpose: CreateFileInput['purpose']): Promise<string[]> {
  const ids: string[] = [];
  for (const a of list) {
    if (a.fileId) ids.push(a.fileId);
    else if (a.file) ids.push(await uploadFile(a.file, a.name, purpose));
  }
  return ids;
}

export function useSaveQuickReply() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (d: QuickReplyDraft) => {
      const fileIds = await fileIdsOf(d.attachments, 'quick_reply');
      const body = { command: d.command, title: d.title, text: d.text, scope: d.scope, fileIds };
      return d.id ? api.patch<QuickReply>(`/quick-replies/${d.id}`, body) : api.post<QuickReply>('/quick-replies', body);
    },
    onSuccess: () => invalidate(qk.quickReplies)
  });
}

export function useDeleteQuickReply() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/quick-replies/${id}`),
    onSuccess: () => invalidate(qk.quickReplies)
  });
}

/* ───────── Media gallery ───────── */

export interface MediaFilter {
  kind?: 'image' | 'video';
  category?: string;
  search?: string;
  favorites?: boolean;
  sort?: 'newest' | 'oldest' | 'popular' | 'name';
}

/** With no filter this shares the `qk.media` cache that AppContext reads. */
export function useMediaItems(filter: MediaFilter = {}) {
  const active = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined && v !== '' && v !== false));
  const empty = Object.keys(active).length === 0;
  return useQuery({
    queryKey: empty ? qk.media : [...qk.media, active],
    queryFn: () =>
      api.get<MediaItem[]>('/media', {
        kind: filter.kind,
        category: filter.category,
        search: filter.search?.trim() || undefined,
        favorites: filter.favorites ? 'true' : undefined,
        sort: filter.sort
      }),
    placeholderData: prev => prev
  });
}

export function useMediaCategories() {
  return useQuery({ queryKey: qk.mediaCategories, queryFn: () => api.get<MediaCategory[]>('/media/categories') });
}

export function useCreateMediaCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => api.post<MediaCategory>('/media/categories', { name }),
    onSuccess: () => invalidate(qk.mediaCategories)
  });
}

export function useDeleteMediaCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/media/categories/${id}`),
    onSuccess: () => invalidate(qk.mediaCategories, qk.media)
  });
}

export interface MediaUpload {
  file: File;
  title: string;
  caption: string;
  categoryId: string | null;
  tags: string[];
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export function useUploadMedia() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (u: MediaUpload) => {
      const fileId = await uploadFile(u.file, u.file.name, 'media');
      return api.post<MediaItem>('/media', {
        fileId,
        title: u.title,
        caption: u.caption,
        categoryId: u.categoryId,
        tags: u.tags,
        width: u.width,
        height: u.height,
        durationSeconds: u.durationSeconds
      });
    },
    onSuccess: () => invalidate(qk.media)
  });
}

export function useDeleteMedia() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/media/${id}`),
    onSuccess: () => invalidate(qk.media)
  });
}

export function useFavoriteMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => api.put<MediaItem>(`/media/${id}/favorite`, { favorite }),
    onMutate: ({ id, favorite }) => {
      qc.setQueriesData<MediaItem[]>({ queryKey: qk.media }, prev => prev?.map(m => (m.id === id ? { ...m, favorite } : m)));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.media })
  });
}

export function useDownloadMedia() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post<{ url: string }>(`/media/${id}/download`),
    onSuccess: () => invalidate(qk.media)
  });
}
