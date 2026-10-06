'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { MediaItem, MediaCategory } from '@/types';
import { formatFileSize } from '@/data/mockData';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function MediaGalleryScreen() {
  const {
    role,
    mediaList,
    addMediaItem,
    deleteMediaItem,
    toggleFavoriteMedia,
    sendMediaToChat,
    conversations,
    setScreen,
    addToast
  } = useApp();

  const [activeTab, setActiveTab] = useState<'all' | 'image' | 'video' | 'fav'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'shares' | 'size'>('newest');

  // Modal states
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Upload Form states
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'image' | 'video'>('image');
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState<MediaCategory>('Products');
  const [newCaption, setNewCaption] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newDuration, setNewDuration] = useState('0:45');
  const [newSizeMb, setNewSizeMb] = useState('2.5');

  // Target conversation for sending media
  const [selectedConvId, setSelectedConvId] = useState<string>(
    conversations[0]?.id || ''
  );

  // Filtered and sorted media
  const filtered = mediaList
    .filter(item => {
      // Type / Tab filter
      if (activeTab === 'image' && item.type !== 'image') return false;
      if (activeTab === 'video' && item.type !== 'video') return false;
      if (activeTab === 'fav' && !item.isFavorite) return false;

      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchCaption = item.caption.toLowerCase().includes(q);
        const matchTag = item.tags.some(t => t.toLowerCase().includes(q));
        if (!matchTitle && !matchCaption && !matchTag) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'shares') return (b.shares || 0) - (a.shares || 0);
      if (sortBy === 'size') return b.size - a.size;
      return 0; // Default order
    });

  const totalImages = mediaList.filter(m => m.type === 'image').length;
  const totalVideos = mediaList.filter(m => m.type === 'video').length;
  const totalFavorites = mediaList.filter(m => m.isFavorite).length;
  const totalStorageBytes = mediaList.reduce((acc, m) => acc + m.size, 0);

  const handleSaveMedia = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      addToast('Please enter a title for the media item.');
      return;
    }

    const fallbackUrl = newType === 'image'
      ? 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80'
      : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

    const tagsArray = newTags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => (t.startsWith('#') ? t : `#${t}`));

    const sizeInBytes = Math.round((parseFloat(newSizeMb) || 2.5) * 1024 * 1024);

    const newItem: MediaItem = {
      id: `med_${Date.now()}`,
      title: newTitle.trim(),
      type: newType,
      url: newUrl.trim() || fallbackUrl,
      thumbnail: newType === 'image' ? (newUrl.trim() || fallbackUrl) : 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=600&q=80',
      caption: newCaption.trim() || `${newTitle} by Madushan Aluminium. 15-year warranty.`,
      size: sizeInBytes,
      duration: newType === 'video' ? (newDuration || '0:45') : undefined,
      category: newCategory,
      tags: tagsArray.length > 0 ? tagsArray : [`#${newCategory.toLowerCase()}`, '#aluminium'],
      addedAt: 'Just now',
      addedBy: role === 'manager' ? 'Madushan P.' : 'Nimal Bandara',
      isFavorite: false,
      shares: 0,
      downloads: 0
    };

    addMediaItem(newItem);
    setIsUploadOpen(false);

    // Reset form
    setNewTitle('');
    setNewUrl('');
    setNewCaption('');
    setNewTags('');
  };

  const handleCopyLink = (item: MediaItem) => {
    try {
      navigator.clipboard.writeText(item.url);
      addToast(`Direct WhatsApp media link copied: ${item.title}`);
    } catch {
      addToast(`Link: ${item.url}`);
    }
  };

  const handleSendToChatAction = (item: MediaItem) => {
    if (!selectedConvId) {
      addToast('Please select an active conversation.');
      return;
    }
    sendMediaToChat(selectedConvId, item);
    if (previewItem) setPreviewItem(null);
  };

  return (
    <div className="gallery-screen-container">
      {/* Top Page Header */}
      <div className="ph">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h1>Media Gallery</h1>
            <span className="chip ok" style={{ fontSize: '11px', padding: '2px 8px' }}>
              ✓ WhatsApp Cloud CDN Synced
            </span>
            <span className="hint" style={{ margin: 0, fontSize: '12px' }}>
              ({role === 'manager' ? 'Manager & Admin Access' : 'Staff Access · Nimal'})
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
            onClick={() => {
              addToast('All media verified with WhatsApp Cloud API specs (Images < 5MB, Videos < 16MB).');
            }}
          >
            ↻ Sync WhatsApp CDN
          </button>
          <button
            className="btn pri"
            onClick={() => setIsUploadOpen(true)}
          >
            + Upload / Save Media
          </button>
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
          <b style={{ color: 'var(--ok)' }}>100%</b>
          <small>Standardized compression &amp; thumbnails</small>
        </div>
        <div className="stat">
          <span>Starred / Favorites</span>
          <b style={{ fontSize: '20px' }}>★ {totalFavorites}</b>
          <small>Fast access for quick chat replies</small>
        </div>
        <div className="stat">
          <span>Cloud Storage Used</span>
          <b style={{ fontSize: '20px' }}>{formatFileSize(totalStorageBytes)} / 15 GB</b>
          <small>16.2% allocated on Meta Media Servers</small>
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
            <option value="Products">Products (Pantry, Vanity, Wardrobe)</option>
            <option value="Workshop">Workshop &amp; Fabrication</option>
            <option value="Installation">Installation &amp; Sites</option>
            <option value="Testimonials">Customer Reviews &amp; Handover</option>
            <option value="Promotions">Promotions &amp; Discounts</option>
          </select>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
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
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--ink-2)' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔍</div>
              <b style={{ display: 'block', fontSize: '16px', color: 'var(--ink)' }}>No media items found</b>
              <p style={{ fontSize: '13.5px', marginTop: '4px' }}>
                Try adjusting your search terms or category filter, or upload a new photo or video clip.
              </p>
              <button
                className="btn pri sm"
                style={{ marginTop: '12px' }}
                onClick={() => {
                  setActiveTab('all');
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
              >
                Reset Filters
              </button>
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
                        <img
                          src={item.thumbnail || 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=600&q=80'}
                          alt={item.title}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            filter: 'brightness(0.75)'
                          }}
                        />
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
                        {item.category}
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
                    Category: {previewItem.category}
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
                  <b>{previewItem.type === 'image' ? 'JPEG / WebP' : `MP4 (${previewItem.duration || '0:45'})`}</b>
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
                    value={selectedConvId}
                    onChange={e => setSelectedConvId(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--rule-2)',
                      background: 'var(--card)',
                      fontSize: '13px'
                    }}
                  >
                    {conversations.map(conv => (
                      <option key={conv.id} value={conv.id}>
                        {conv.pv.slice(0, 30)}...
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
                    style={{ color: previewItem.isFavorite ? 'var(--warn)' : 'var(--ink)' }}
                    onClick={() => toggleFavoriteMedia(previewItem.id)}
                  >
                    {previewItem.isFavorite ? '★ Starred' : '☆ Star'}
                  </button>
                  {role === 'manager' && (
                    <button
                      type="button"
                      className="btn"
                      style={{ color: 'var(--bad)' }}
                      onClick={() => {
                        deleteMediaItem(previewItem.id);
                        setPreviewItem(null);
                      }}
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
          onClick={() => setIsUploadOpen(false)}
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
                onClick={() => setIsUploadOpen(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveMedia} style={{ padding: '20px' }}>
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

              {/* Title */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Title <span style={{ color: 'var(--bad)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Modern Teak Aluminium Pantry Cupboard with Soft Close"
                  required
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--rule-2)',
                    background: 'var(--card-2)',
                    fontSize: '13.5px',
                    color: 'var(--ink)'
                  }}
                />
              </div>

              {/* Category & Size in grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value as MediaCategory)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--rule-2)',
                      background: 'var(--card-2)',
                      fontSize: '13.5px',
                      color: 'var(--ink)'
                    }}
                  >
                    <option value="Products">Products</option>
                    <option value="Workshop">Workshop &amp; Factory</option>
                    <option value="Installation">Installation &amp; Sites</option>
                    <option value="Testimonials">Testimonials</option>
                    <option value="Promotions">Promotions</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    {newType === 'video' ? 'Video Duration' : 'Approx File Size'}
                  </label>
                  {newType === 'video' ? (
                    <input
                      type="text"
                      placeholder="e.g. 0:45 or 1:15"
                      value={newDuration}
                      onChange={e => setNewDuration(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--rule-2)',
                        background: 'var(--card-2)',
                        fontSize: '13.5px',
                        color: 'var(--ink)'
                      }}
                    />
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. 2.4 MB"
                      value={newSizeMb}
                      onChange={e => setNewSizeMb(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--rule-2)',
                        background: 'var(--card-2)',
                        fontSize: '13.5px',
                        color: 'var(--ink)'
                      }}
                    />
                  )}
                </div>
              </div>

              {/* URL or Upload File */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Image or Video URL / File
                </label>
                <input
                  type="url"
                  placeholder="https://... or leave empty to use high-res demo asset"
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--rule-2)',
                    background: 'var(--card-2)',
                    fontSize: '13.5px',
                    color: 'var(--ink)'
                  }}
                />
                <span className="hint" style={{ marginTop: '4px' }}>
                  Accepts HTTPS image links (JPG, PNG, WebP) or video stream links (MP4, WebM).
                </span>
              </div>

              {/* Caption */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  WhatsApp Message Caption
                </label>
                <textarea
                  rows={3}
                  placeholder="Caption sent automatically when attaching this photo/video to a customer in WhatsApp..."
                  value={newCaption}
                  onChange={e => setNewCaption(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--rule-2)',
                    background: 'var(--card-2)',
                    fontSize: '13.5px',
                    color: 'var(--ink)',
                    resize: 'vertical'
                  }}
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
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--rule-2)',
                    background: 'var(--card-2)',
                    fontSize: '13.5px',
                    color: 'var(--ink)'
                  }}
                />
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setIsUploadOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn pri"
                >
                  Save to Media Gallery
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
          All images and videos in this gallery are cached and verified against Meta WhatsApp Cloud standards. Both Managers and Staff can instantly send these photos and video clips to active customer chats.
        </div>
      </div>
    </div>
  );
}
