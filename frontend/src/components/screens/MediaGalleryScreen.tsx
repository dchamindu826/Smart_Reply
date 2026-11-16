'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { MediaItem as ApiMediaItem } from '@smart-reply/shared';
import { EXTRA_IMAGE_MIMES, MEDIA_LIMITS } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useSession } from '@/features/session';
import {
  useCreateMediaCategory,
  useDeleteMedia,
  useDeleteMediaCategory,
  useDownloadMedia,
  useFavoriteMedia,
  useMediaCategories,
  useMediaItems,
  useUploadMedia
} from '@/features/content';
import { MediaItem } from '@/types';
import { toMedia } from '@/lib/adapters';
import { errorMessage } from '@/lib/api';
import { formatFileSize } from '@/lib/ui';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

const NEW_CATEGORY = '__new__';
const IMAGE_ACCEPT = [...MEDIA_LIMITS.image.mimes, ...EXTRA_IMAGE_MIMES.filter(m => m !== 'image/svg+xml')].join(',');
const VIDEO_ACCEPT = [...MEDIA_LIMITS.video.mimes, 'video/quicktime'].join(',');
/** The API allows gallery videos up to 100 MB; WhatsApp sends up to 16 MB. */
const GALLERY_VIDEO_MAX = 100 * 1024 * 1024;

/** True when WhatsApp accepts the file as it is (type and size). */
function whatsappReady(m: ApiMediaItem): boolean {
  const limit = m.kind === 'image' ? MEDIA_LIMITS.image : MEDIA_LIMITS.video;
  return (limit.mimes as readonly string[]).includes(m.file.mime) && m.file.sizeBytes <= limit.max;
}

function formatLabel(mime: string): string {
  const sub = mime.split('/')[1] ?? mime;
  return { jpeg: 'JPEG', png: 'PNG', webp: 'WebP', gif: 'GIF', mp4: 'MP4', '3gpp': '3GP', quicktime: 'MOV' }[sub] ?? sub.toUpperCase();
}

interface FileInfo {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  previewUrl: string;
}

/** Read the pixel size (and video length) in the browser before uploading. */
function readFileInfo(file: File): Promise<FileInfo> {
  const previewUrl = URL.createObjectURL(file);
  return new Promise(resolve => {
    if (file.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null, durationSeconds: null, previewUrl });
      img.onerror = () => resolve({ width: null, height: null, durationSeconds: null, previewUrl });
      img.src = previewUrl;
    } else {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () =>
        resolve({
          width: v.videoWidth || null,
          height: v.videoHeight || null,
          durationSeconds: Number.isFinite(v.duration) && v.duration > 0 ? Math.max(1, Math.round(v.duration)) : null,
          previewUrl
        });
      v.onerror = () => resolve({ width: null, height: null, durationSeconds: null, previewUrl });
      v.src = previewUrl;
    }
  });
}

export default function MediaGalleryScreen() {
  const { role, sendMediaToChat, conversations, contacts, activeConversationId, setScreen, addToast, reportError } = useApp();
  const { me } = useSession();
  const isManager = role === 'manager';

  const [activeTab, setActiveTab] = useState<'all' | 'image' | 'video' | 'fav'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'shares' | 'size'>('newest');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Every item (for the counts) and the filtered list from the API.
  const allQ = useMediaItems();
  const listQ = useMediaItems({
    kind: activeTab === 'image' || activeTab === 'video' ? activeTab : undefined,
    favorites: activeTab === 'fav',
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
    search,
    sort: sortBy === 'shares' ? 'popular' : 'newest'
  });
  const categoriesQ = useMediaCategories();
  const categories = categoriesQ.data ?? [];

  const favorite = useFavoriteMedia();
  const removeMedia = useDeleteMedia();
  const download = useDownloadMedia();
  const upload = useUploadMedia();
  const createCategory = useCreateMediaCategory();
  const deleteCategory = useDeleteMediaCategory();

  const allApi = useMemo(() => allQ.data ?? [], [allQ.data]);
  const mediaList = useMemo(() => allApi.map(toMedia), [allApi]);
  const apiById = useMemo(() => new Map([...allApi, ...(listQ.data ?? [])].map(m => [m.id, m])), [allApi, listQ.data]);

  // Modal states
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Upload Form states
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'image' | 'video'>('image');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newInfo, setNewInfo] = useState<FileInfo | null>(null);
  const [newCategory, setNewCategory] = useState<string>('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCaption, setNewCaption] = useState('');
  const [newTags, setNewTags] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Target conversation for sending media
  const [selectedConvId, setSelectedConvId] = useState<string>(activeConversationId ?? '');
  const targetConvId = selectedConvId || activeConversationId || conversations[0]?.id || '';

  // Filtered and sorted media
  const filtered = useMemo(() => {
    const list = (listQ.data ?? []).map(toMedia);
    if (sortBy === 'size') list.sort((a, b) => b.size - a.size);
    return list;
  }, [listQ.data, sortBy]);

  const previewItem: MediaItem | null = useMemo(() => {
    if (!previewId) return null;
    const a = apiById.get(previewId);
    return a ? toMedia(a) : null;
  }, [previewId, apiById]);
  const setPreviewItem = (item: MediaItem | null) => setPreviewId(item?.id ?? null);
  const previewApi = previewId ? apiById.get(previewId) : undefined;

  const totalImages = mediaList.filter(m => m.type === 'image').length;
  const totalVideos = mediaList.filter(m => m.type === 'video').length;
  const totalFavorites = mediaList.filter(m => m.isFavorite).length;
  const totalStorageBytes = mediaList.reduce((acc, m) => acc + m.size, 0);
  const readyCount = allApi.filter(whatsappReady).length;
  const readyPercent = allApi.length ? Math.round((readyCount / allApi.length) * 100) : 100;

  const toggleFavoriteMedia = (id: string) => {
    const item = apiById.get(id);
    if (!item) return;
    favorite.mutate({ id, favorite: !item.favorite }, { onError: reportError });
  };

  const resetUploadForm = () => {
    if (newInfo) URL.revokeObjectURL(newInfo.previewUrl);
    setNewTitle('');
    setNewFile(null);
    setNewInfo(null);
    setNewCaption('');
    setNewTags('');
    setNewCategoryName('');
    setUploadError(null);
  };

  const closeUpload = () => {
    if (upload.isPending) return;
    resetUploadForm();
    setIsUploadOpen(false);
  };

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setUploadError(null);
    const kind = f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : null;
    if (!kind) {
      setUploadError('The gallery holds photos and videos only.');
      return;
    }
    const max = kind === 'image' ? MEDIA_LIMITS.image.max : GALLERY_VIDEO_MAX;
    if (f.size > max) {
      setUploadError(`${f.name} is ${formatFileSize(f.size)}. ${kind === 'image' ? 'Images' : 'Videos'} can be at most ${Math.round(max / 1048576)} MB.`);
      return;
    }
    setNewType(kind);
    setNewFile(f);
    if (!newTitle.trim()) setNewTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120));
    if (newInfo) URL.revokeObjectURL(newInfo.previewUrl);
    setNewInfo(null);
    void readFileInfo(f).then(setNewInfo);
  };

  const handleSaveMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    if (!newTitle.trim()) {
      setUploadError('Please enter a title for the media item.');
      return;
    }
    if (!newFile) {
      setUploadError('Choose a photo or video to upload.');
      return;
    }

    const tagsArray = [
      ...new Set(
        newTags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean)
          .map(t => (t.startsWith('#') ? t : `#${t}`).slice(0, 30))
      )
    ];

    try {
      let categoryId: string | null = newCategory && newCategory !== NEW_CATEGORY ? newCategory : null;
      if (newCategory === NEW_CATEGORY) {
        if (!newCategoryName.trim()) {
          setUploadError('Enter a name for the new category.');
          return;
        }
        const c = await createCategory.mutateAsync(newCategoryName.trim());
        categoryId = c.id;
        setNewCategory(c.id);
      }
      const info = newInfo ?? (await readFileInfo(newFile));
      const item = await upload.mutateAsync({
        file: newFile,
        title: newTitle.trim(),
        caption: newCaption.trim(),
        categoryId,
        tags: tagsArray,
        width: info.width,
        height: info.height,
        durationSeconds: info.durationSeconds
      });
      addToast(`Added "${item.title}" to Media Gallery.`);
      resetUploadForm();
      setIsUploadOpen(false);
    } catch (err) {
      setUploadError(errorMessage(err));
    }
  };

  const handleCopyLink = (item: MediaItem) => {
    navigator.clipboard
      .writeText(item.url)
      .then(() => addToast(`Media link copied: ${item.title}`))
      .catch(() => addToast(`Link: ${item.url}`));
  };

  const handleDownload = (item: MediaItem) => {
    download.mutate(item.id, {
      onSuccess: ({ url }) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = apiById.get(item.id)?.file.name ?? item.title;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      },
      onError: reportError
    });
  };

  const handleDelete = (item: MediaItem) => {
    if (!window.confirm(`Delete "${item.title}" from the Media Gallery?`)) return;
    removeMedia.mutate(item.id, {
      onSuccess: () => {
        addToast('Item removed from Media Gallery.');
        setPreviewItem(null);
      },
      onError: reportError
    });
  };

  const handleDeleteCategory = () => {
    const c = categories.find(x => x.id === selectedCategory);
    if (!c || !window.confirm(`Delete category "${c.name}"? Its photos and videos stay in the gallery.`)) return;
    deleteCategory.mutate(c.id, {
      onSuccess: () => {
        addToast(`Category "${c.name}" deleted.`);
        setSelectedCategory('all');
      },
      onError: reportError
    });
  };

  const convName = (convId: string) => {
    const conv = conversations.find(c => c.id === convId);
    return conv ? (contacts[conv.c]?.n ?? 'customer') : 'customer';
  };

  const handleSendToChatAction = (item: MediaItem) => {
    if (!targetConvId) {
      addToast('Open a chat first, then send media from the gallery.');
      setScreen('chats');
      return;
    }
    sendMediaToChat(targetConvId, item);
    addToast(`Sending "${item.title}" to ${convName(targetConvId)}…`);
    if (previewItem) setPreviewItem(null);
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--rule-2)',
    background: 'var(--card-2)',
    fontSize: '13.5px',
    color: 'var(--ink)'
  };

  return (
    <div className="gallery-screen-container">
      {/* Top Page Header */}
      <div className="ph">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h1>Media Gallery</h1>
            {me?.features.whatsappConnected ? (
              <span className="chip ok" style={{ fontSize: '11px', padding: '2px 8px' }}>
                ✓ WhatsApp connected
              </span>
            ) : (
              <span className="chip w" style={{ fontSize: '11px', padding: '2px 8px' }}>
                WhatsApp not connected
              </span>
            )}
            <span className="hint" style={{ margin: 0, fontSize: '12px' }}>
              ({isManager ? 'Manager & Admin Access' : `Staff Access · ${me?.user.name.split(' ')[0] ?? ''}`})
            </span>
          </div>
          <p>
            Saved high-resolution photos and demonstration videos for WhatsApp chats, quotes, and customer inquiries.
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button
            className="btn"
            disabled={allQ.isFetching || listQ.isFetching}
            onClick={() => {
              void Promise.all([allQ.refetch(), listQ.refetch(), categoriesQ.refetch()]).then(() => addToast('Media Gallery refreshed.'));
            }}
          >
            ↻ Refresh
          </button>
          {isManager && (
            <button
              className="btn pri"
              onClick={() => setIsUploadOpen(true)}
            >
              + Upload / Save Media
            </button>
          )}
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="stats">
        <div className="stat i">
          <span>Total Media Items</span>
          <b>{mediaList.length}</b>
          <small>{totalImages} photos · {totalVideos} video clips</small>
        </div>
        <div className="stat ok">
          <span>WhatsApp HD Ready</span>
          <b style={{ color: readyPercent === 100 ? 'var(--ok)' : 'var(--warn)' }}>{readyPercent}%</b>
          <small>
            {readyCount} of {allApi.length} within WhatsApp limits (JPG/PNG ≤ {Math.round(MEDIA_LIMITS.image.max / 1048576)} MB · MP4 ≤ {Math.round(MEDIA_LIMITS.video.max / 1048576)} MB)
          </small>
        </div>
        <div className="stat">
          <span>Starred / Favorites</span>
          <b style={{ fontSize: '20px' }}>★ {totalFavorites}</b>
          <small>Fast access for quick chat replies</small>
        </div>
        <div className="stat">
          <span>Cloud Storage Used</span>
          <b style={{ fontSize: '20px' }}>{mediaList.length ? formatFileSize(totalStorageBytes) : '0 MB'}</b>
          <small>{mediaList.length} file(s) in the gallery</small>
        </div>
      </div>

      {/* Filter Toolbar Card */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-h" style={{ flexWrap: 'wrap', gap: '10px' }}>
          {/* Media Type Tabs */}
          <div className="seg">
            <button
              className={activeTab === 'all' ? 'active' : ''}
              onClick={() => setActiveTab('all')}
            >
              All ({mediaList.length})
            </button>
            <button
              className={activeTab === 'image' ? 'active' : ''}
              onClick={() => setActiveTab('image')}
            >
              🖼 Photos ({totalImages})
            </button>
            <button
              className={activeTab === 'video' ? 'active' : ''}
              onClick={() => setActiveTab('video')}
            >
              ▶ Videos ({totalVideos})
            </button>
            <button
              className={activeTab === 'fav' ? 'active' : ''}
              onClick={() => setActiveTab('fav')}
            >
              ★ Favorites ({totalFavorites})
            </button>
          </div>

          <span className="sp" />

          {/* Search Bar */}
          <div style={{ position: 'relative', minWidth: '220px' }}>
            <input
              type="search"
              placeholder="Search by title, #tag, or caption..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 12px',
                fontSize: '13px',
                borderRadius: '6px',
                border: '1px solid var(--rule-2)',
                background: 'var(--card-2)',
                color: 'var(--ink)'
              }}
            />
          </div>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            style={{
              padding: '6px 10px',
              fontSize: '13px',
              borderRadius: '6px',
              border: '1px solid var(--rule-2)',
              background: 'var(--card-2)',
              color: 'var(--ink)',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {isManager && selectedCategory !== 'all' && (
            <button type="button" className="btn sm" style={{ color: 'var(--bad)' }} disabled={deleteCategory.isPending} onClick={handleDeleteCategory}>
              Delete category
            </button>
          )}

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'newest' | 'shares' | 'size')}
            style={{
              padding: '6px 10px',
              fontSize: '13px',
              borderRadius: '6px',
              border: '1px solid var(--rule-2)',
              background: 'var(--card-2)',
              color: 'var(--ink)',
              cursor: 'pointer'
            }}
          >
            <option value="newest">Sort: Newest</option>
            <option value="shares">Sort: Most Shared</option>
            <option value="size">Sort: File Size</option>
          </select>
        </div>

        {/* Media Grid */}
        <div className="card-b" style={{ padding: '16px' }}>
          {listQ.isLoading ? (
            <p className="hint" style={{ margin: 0 }}>Loading…</p>
          ) : listQ.isError ? (
            <p className="hint" style={{ margin: 0, color: 'var(--bad)' }}>{errorMessage(listQ.error)}</p>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--ink-2)' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔍</div>
              <b style={{ display: 'block', fontSize: '16px', color: 'var(--ink)' }}>
                {mediaList.length === 0 ? 'The gallery is empty' : 'No media items found'}
              </b>
              <p style={{ fontSize: '13.5px', marginTop: '4px' }}>
                {mediaList.length === 0
                  ? isManager
                    ? 'Upload product photos and demonstration videos so the team can send them in chats.'
                    : 'Your manager has not added photos or videos yet.'
                  : 'Try adjusting your search terms or category filter, or upload a new photo or video clip.'}
              </p>
              {mediaList.length > 0 && <button
                className="btn pri sm"
                style={{ marginTop: '12px' }}
                onClick={() => {
                  setActiveTab('all');
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
              >
                Reset Filters
              </button>}
              {mediaList.length === 0 && isManager && (
                <button className="btn pri sm" style={{ marginTop: '12px' }} onClick={() => setIsUploadOpen(true)}>
                  + Upload / Save Media
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px'
              }}
            >
              {filtered.map(item => (
                <div
                  key={item.id}
                  style={{
                    borderRadius: '10px',
                    border: '1px solid var(--rule)',
                    background: 'var(--card)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.04)';
                  }}
                >
                  {/* Media Visual Area */}
                  <div
                    style={{
                      position: 'relative',
                      height: '180px',
                      background: '#0B1D35',
                      overflow: 'hidden',
                      cursor: 'pointer'
                    }}
                    onClick={() => setPreviewItem(item)}
                  >
                    {item.type === 'image' ? (
                      <img
                        src={item.thumbnail || item.url}
                        alt={item.title}
                        loading="lazy"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block'
                        }}
                      />
                    ) : (
                      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        {item.thumbnail ? (
                          <img
                            src={item.thumbnail}
                            alt={item.title}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              filter: 'brightness(0.75)'
                            }}
                          />
                        ) : (
                          <video
                            src={`${item.url}#t=0.5`}
                            preload="metadata"
                            muted
                            playsInline
                            aria-label={item.title}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              filter: 'brightness(0.75)',
                              pointerEvents: 'none'
                            }}
                          />
                        )}
                        {/* Play Video Overlay Badge */}
                        <div
                          style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            background: 'rgba(0, 45, 112, 0.85)',
                            border: '2px solid rgba(255,255,255,0.85)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '18px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            backdropFilter: 'blur(4px)'
                          }}
                        >
                          ▶
                        </div>
                        {/* Video Duration Badge */}
                        {item.duration && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '8px',
                              right: '8px',
                              background: 'rgba(0,0,0,0.75)',
                              color: '#fff',
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontFamily: 'monospace'
                            }}
                          >
                            {item.duration}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Top Badges Over Image */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '8px',
                        left: '8px',
                        display: 'flex',
                        gap: '6px'
                      }}
                    >
                      <span
                        style={{
                          background: item.type === 'image' ? 'rgba(11, 111, 212, 0.9)' : 'rgba(200, 16, 176, 0.9)',
                          color: '#fff',
                          fontSize: '10.5px',
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                          backdropFilter: 'blur(4px)'
                        }}
                      >
                        {item.type === 'image' ? 'Photo' : 'Video'}
                      </span>
                      <span
                        style={{
                          background: 'rgba(0,0,0,0.65)',
                          color: '#fff',
                          fontSize: '10.5px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backdropFilter: 'blur(4px)'
                        }}
                      >
                        {item.category || 'Uncategorised'}
                      </span>
                    </div>

                    {/* Star / Favorite Button */}
                    <button
                      type="button"
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        background: item.isFavorite ? '#FFB800' : 'rgba(0,0,0,0.5)',
                        color: item.isFavorite ? '#000' : '#fff',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '15px',
                        transition: 'all 0.15s ease'
                      }}
                      title={item.isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteMedia(item.id);
                      }}
                    >
                      ★
                    </button>
                  </div>

                  {/* Card Info Area */}
                  <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <b
                        style={{
                          fontSize: '14px',
                          lineHeight: '1.3',
                          cursor: 'pointer',
                          color: 'var(--ink)'
                        }}
                        onClick={() => setPreviewItem(item)}
                      >
                        {item.title}
                      </b>
                    </div>

                    {/* Short Caption */}
                    <p
                      style={{
                        fontSize: '12.5px',
                        color: 'var(--ink-2)',
                        marginTop: '6px',
                        lineHeight: '1.4',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        flex: 1
                      }}
                    >
                      {item.caption}
                    </p>

                    {/* Tags */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                      {item.tags.slice(0, 3).map(tag => (
                        <span
                          key={tag}
                          style={{
                            fontSize: '10.5px',
                            background: 'var(--card-2)',
                            color: 'var(--blue)',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            border: '1px solid var(--rule)'
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                      {item.tags.length > 3 && (
                        <span style={{ fontSize: '10.5px', color: 'var(--ink-3)' }}>
                          +{item.tags.length - 3}
                        </span>
                      )}
                    </div>

                    {/* Metadata Footer */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '10px',
                        paddingTop: '8px',
                        borderTop: '1px solid var(--rule)',
                        fontSize: '11.5px',
                        color: 'var(--ink-3)'
                      }}
                    >
                      <span>{formatFileSize(item.size)}</span>
                      <span>💬 {item.shares || 0} shared</span>
                      <span>By {item.addedBy.split(' ')[0]}</span>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                      <button
                        type="button"
                        className="btn sm pri"
                        style={{ flex: 1, padding: '5px 8px', fontSize: '12px' }}
                        title="Send this media directly into active customer chat"
                        onClick={() => handleSendToChatAction(item)}
                      >
                        ✉ Send in Chat
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        style={{ padding: '5px 8px', fontSize: '12px' }}
                        title="Preview & Details"
                        onClick={() => setPreviewItem(item)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        style={{ padding: '5px 8px', fontSize: '12px' }}
                        title="Copy WhatsApp link"
                        onClick={() => handleCopyLink(item)}
                      >
                        🔗
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox / Video Preview Modal */}
      {previewItem && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 15, 31, 0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setPreviewItem(null)}
        >
          <div
            style={{
              background: 'var(--card)',
              borderRadius: '14px',
              maxWidth: '850px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              border: '1px solid var(--rule-2)',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid var(--rule)'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      background: previewItem.type === 'image' ? 'var(--info-bg)' : 'rgba(200, 16, 176, 0.15)',
                      color: previewItem.type === 'image' ? 'var(--blue)' : 'var(--magenta)',
                      fontWeight: 600,
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px'
                    }}
                  >
                    {previewItem.type === 'image' ? 'IMAGE / PHOTO' : 'VIDEO DEMO'}
                  </span>
                  <span className="chip ok" style={{ fontSize: '11px' }}>
                    Category: {previewItem.category || 'Uncategorised'}
                  </span>
                </div>
                <h2 style={{ fontSize: '18px', marginTop: '4px', color: 'var(--ink)' }}>
                  {previewItem.title}
                </h2>
              </div>

              <button
                type="button"
                className="x"
                style={{
                  background: 'var(--card-2)',
                  border: '1px solid var(--rule)',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  cursor: 'pointer'
                }}
                onClick={() => setPreviewItem(null)}
              >
                ×
              </button>
            </div>

            {/* Media Player / Image Viewer Area */}
            <div
              style={{
                background: '#060D1A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '360px',
                maxHeight: '480px',
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              {previewItem.type === 'image' ? (
                <img
                  src={previewItem.url}
                  alt={previewItem.title}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '480px',
                    objectFit: 'contain'
                  }}
                />
              ) : (
                <video
                  controls
                  autoPlay
                  src={previewItem.url}
                  poster={previewItem.thumbnail}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '480px',
                    width: '100%'
                  }}
                >
                  Your browser does not support HTML5 video.
                </video>
              )}
            </div>

            {/* Modal Body / Information */}
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '14px' }}>
                <b style={{ fontSize: '13px', color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  WhatsApp Ready Caption &amp; Description:
                </b>
                <p style={{ marginTop: '4px', fontSize: '14px', lineHeight: '1.5', color: 'var(--ink)' }}>
                  {previewItem.caption}
                </p>
              </div>

              {/* Tags & Metadata */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                {previewItem.tags.map(tag => (
                  <span
                    key={tag}
                    style={{
                      background: 'var(--card-2)',
                      color: 'var(--blue)',
                      fontSize: '12px',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--rule)'
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '12px',
                  background: 'var(--card-2)',
                  padding: '12px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  marginBottom: '16px'
                }}
              >
                <div>
                  <span style={{ color: 'var(--ink-3)', display: 'block' }}>File Size</span>
                  <b>{formatFileSize(previewItem.size)}</b>
                </div>
                <div>
                  <span style={{ color: 'var(--ink-3)', display: 'block' }}>Format / Type</span>
                  <b>
                    {previewApi ? formatLabel(previewApi.file.mime) : previewItem.type === 'image' ? 'Image' : 'Video'}
                    {previewItem.width && previewItem.height ? ` · ${previewItem.width}×${previewItem.height}` : ''}
                    {previewItem.duration ? ` (${previewItem.duration})` : ''}
                  </b>
                </div>
                <div>
                  <span style={{ color: 'var(--ink-3)', display: 'block' }}>Added By</span>
                  <b>{previewItem.addedBy}</b>
                </div>
                <div>
                  <span style={{ color: 'var(--ink-3)', display: 'block' }}>WhatsApp Shares</span>
                  <b>{previewItem.shares || 0} times</b>
                </div>
              </div>

              {/* Modal Actions */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--rule)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ink-2)' }}>Target Chat:</span>
                  <select
                    value={targetConvId}
                    onChange={e => setSelectedConvId(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--rule-2)',
                      background: 'var(--card)',
                      fontSize: '13px'
                    }}
                  >
                    {conversations.length === 0 && <option value="">No chats yet</option>}
                    {conversations.map(conv => (
                      <option key={conv.id} value={conv.id}>
                        {contacts[conv.c]?.n ?? 'Customer'}{conv.pv ? ` · ${conv.pv.slice(0, 24)}…` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => handleCopyLink(previewItem)}
                  >
                    📋 Copy Media Link
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={download.isPending}
                    onClick={() => handleDownload(previewItem)}
                  >
                    ⬇ Download
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ color: previewItem.isFavorite ? 'var(--warn)' : 'var(--ink)' }}
                    onClick={() => toggleFavoriteMedia(previewItem.id)}
                  >
                    {previewItem.isFavorite ? '★ Starred' : '☆ Star'}
                  </button>
                  {isManager && (
                    <button
                      type="button"
                      className="btn"
                      style={{ color: 'var(--bad)' }}
                      disabled={removeMedia.isPending}
                      onClick={() => handleDelete(previewItem)}
                    >
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn pri"
                    onClick={() => handleSendToChatAction(previewItem)}
                  >
                    ✉ Send into WhatsApp Chat
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload / Save Media Modal */}
      {isUploadOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 15, 31, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={closeUpload}
        >
          <div
            style={{
              background: 'var(--card)',
              borderRadius: '14px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '1px solid var(--rule-2)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid var(--rule)'
              }}
            >
              <div>
                <h2 style={{ fontSize: '18px', color: 'var(--ink)' }}>
                  Save New Photo or Video
                </h2>
                <p style={{ fontSize: '12.5px', color: 'var(--ink-2)', marginTop: '2px' }}>
                  Upload product photos, workshop videos, or customer project showcases to the gallery.
                </p>
              </div>
              <button
                type="button"
                className="x"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '22px',
                  cursor: 'pointer',
                  color: 'var(--ink-2)'
                }}
                onClick={closeUpload}
              >
                ×
              </button>
            </div>

            <form onSubmit={e => void handleSaveMedia(e)} style={{ padding: '20px' }}>
              {/* Media Type Selector */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Media Type
                </label>
                <div className="seg" style={{ width: '100%' }}>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    className={newType === 'image' ? 'active' : ''}
                    onClick={() => setNewType('image')}
                  >
                    🖼 High-Res Image / Photo
                  </button>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    className={newType === 'video' ? 'active' : ''}
                    onClick={() => setNewType('video')}
                  >
                    ▶ Video Clip / Demonstration
                  </button>
                </div>
              </div>

              {/* File */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  {newType === 'video' ? 'Video File' : 'Image File'} <span style={{ color: 'var(--bad)' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <label className="btn sm" style={{ cursor: 'pointer' }}>
                    {newFile ? 'Choose another file' : newType === 'video' ? '▶ Choose video' : '🖼 Choose photo'}
                    <input
                      type="file"
                      accept={newType === 'video' ? VIDEO_ACCEPT : IMAGE_ACCEPT}
                      style={{ display: 'none' }}
                      onChange={handlePickFile}
                    />
                  </label>
                  {newFile && (
                    <span style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
                      {newFile.name} · {formatFileSize(newFile.size)}
                    </span>
                  )}
                </div>
                {newInfo && newFile && (
                  <div style={{ marginTop: '10px', height: '140px', background: '#060D1A', borderRadius: '8px', overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
                    {newType === 'image' ? (
                      <img src={newInfo.previewUrl} alt="" style={{ maxHeight: '140px', objectFit: 'contain' }} />
                    ) : (
                      <video src={newInfo.previewUrl} muted controls style={{ maxHeight: '140px' }} />
                    )}
                  </div>
                )}
                <span className="hint" style={{ marginTop: '4px' }}>
                  {newType === 'video'
                    ? `MP4 or 3GP. WhatsApp sends videos up to ${Math.round(MEDIA_LIMITS.video.max / 1048576)} MB.`
                    : `JPG or PNG up to ${Math.round(MEDIA_LIMITS.image.max / 1048576)} MB (WebP and GIF are kept in the gallery only).`}
                </span>
              </div>

              {/* Title */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Title <span style={{ color: 'var(--bad)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Modern Teak Aluminium Pantry Cupboard with Soft Close"
                  required
                  maxLength={120}
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  style={fieldStyle}
                />
              </div>

              {/* Category & detected details in grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Category
                  </label>
                  <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={fieldStyle}>
                    <option value="">No category</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    <option value={NEW_CATEGORY}>+ New category…</option>
                  </select>
                  {newCategory === NEW_CATEGORY && (
                    <input
                      type="text"
                      placeholder="e.g. Installation & Sites"
                      maxLength={40}
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      style={{ ...fieldStyle, marginTop: '6px' }}
                    />
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    {newType === 'video' ? 'Video Duration' : 'Image Size'}
                  </label>
                  <div style={{ ...fieldStyle, color: 'var(--ink-2)' }}>
                    {!newFile
                      ? 'Read from the file'
                      : !newInfo
                        ? 'Reading…'
                        : [
                            newInfo.width && newInfo.height ? `${newInfo.width}×${newInfo.height}` : null,
                            newInfo.durationSeconds ? `${Math.floor(newInfo.durationSeconds / 60)}:${String(newInfo.durationSeconds % 60).padStart(2, '0')}` : null,
                            formatFileSize(newFile.size)
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                  </div>
                </div>
              </div>

              {/* Caption */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  WhatsApp Message Caption
                </label>
                <textarea
                  rows={3}
                  maxLength={1024}
                  placeholder="Caption sent automatically when attaching this photo/video to a customer in WhatsApp..."
                  value={newCaption}
                  onChange={e => setNewCaption(e.target.value)}
                  style={{ ...fieldStyle, resize: 'vertical' }}
                />
              </div>

              {/* Tags */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="#pantry, #sliding, #teak, #waterproof"
                  value={newTags}
                  onChange={e => setNewTags(e.target.value)}
                  style={fieldStyle}
                />
              </div>

              {uploadError && (
                <div className="note w" style={{ marginTop: 0, marginBottom: '14px' }}>
                  <span className="ic">⚠</span>
                  <div>
                    <b>Not saved</b>
                    {uploadError}
                  </div>
                </div>
              )}

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn"
                  disabled={upload.isPending}
                  onClick={closeUpload}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn pri"
                  disabled={upload.isPending || createCategory.isPending}
                >
                  {upload.isPending ? 'Uploading…' : 'Save to Media Gallery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Helpful Hint Callout at Bottom */}
      <div className="note i" style={{ marginTop: '16px' }}>
        <span className="ic">🖼</span>
        <div>
          <b>WhatsApp Cloud Media Optimization</b>
          All images and videos in this gallery are checked against WhatsApp Cloud media limits when they are uploaded. Both Managers and Staff can instantly send these photos and video clips to active customer chats.
        </div>
      </div>
    </div>
  );
}
