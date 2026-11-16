'use client';

import React, { useMemo, useState } from 'react';
import type { Product as ApiProduct, ProductCollection, ProductInput } from '@smart-reply/shared';
import { formatMoney } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useSession } from '@/features/session';
import { useCollections, useDeleteCollection, useDeleteProduct, useProducts, useSaveCollection, useSaveProduct } from '@/features/content';
import { toProduct } from '@/lib/adapters';
import { errorMessage } from '@/lib/api';
import { PRODUCT_ARTWORK } from '@/lib/ui';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

const NO_COLLECTION = 'none';

function toMinor(v: string): number | null {
  const n = parseFloat(v.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function toMajor(minor: number | null | undefined): string {
  return minor === null || minor === undefined ? '' : String(minor / 100);
}

export default function CatalogScreen() {
  const { role, addToast, openSheet, closeSheet, activeConversationId, sendProductMessage } = useApp();
  const { me } = useSession();
  const isManager = role === 'manager';
  const canEditPrices = isManager || Boolean(me?.permissions.editPrices);

  const productsQ = useProducts();
  const collectionsQ = useCollections();
  const apiProducts = useMemo(() => productsQ.data ?? [], [productsQ.data]);
  const collections = useMemo(() => collectionsQ.data ?? [], [collectionsQ.data]);
  const [filter, setFilter] = useState('all');

  const filtered = apiProducts.filter(p => {
    if (filter === 'all') return true;
    if (filter === NO_COLLECTION) return !p.collectionId;
    return p.collectionId === filter;
  });
  const hasLoose = apiProducts.some(p => !p.collectionId);

  const handleShareLink = () => {
    const digits = (me?.company?.displayPhone ?? '').replace(/\D/g, '');
    if (!digits) {
      addToast('The catalog link is available once WhatsApp is connected.');
      return;
    }
    const link = `https://wa.me/c/${digits}`;
    navigator.clipboard
      .writeText(link)
      .then(() => addToast(`Catalog link copied: wa.me/c/${digits}`))
      .catch(() => addToast(`Catalog link: ${link}`));
  };

  const openProductForm = (product: ApiProduct | null) => {
    openSheet(
      <ProductForm
        product={product}
        collections={collections}
        priceOnly={!isManager}
        defaultCollectionId={filter !== 'all' && filter !== NO_COLLECTION ? filter : null}
        onDone={closeSheet}
      />
    );
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>Catalog &amp; pricing</h1>
          <p>
            Products customers can browse and order inside WhatsApp. Staff send them from a chat with the photo and price shown here.
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button className="btn" onClick={handleShareLink}>
            Share catalog link
          </button>
          {isManager && (
            <button className="btn" onClick={() => openSheet(<CollectionsManager />)}>
              Collections
            </button>
          )}
          {isManager && (
            <button className="btn pri" onClick={() => openProductForm(null)}>
              Add product
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="seg">
            {[
              { id: 'all', label: `All ${apiProducts.length}` },
              ...collections.map(c => ({ id: c.id, label: c.name })),
              ...(hasLoose ? [{ id: NO_COLLECTION, label: 'Other' }] : [])
            ].map(tab => (
              <button
                key={tab.id}
                aria-pressed={filter === tab.id}
                className={filter === tab.id ? 'active' : ''}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="sp" />
          <span className="chip ok">{apiProducts.filter(p => p.status === 'active').length} in catalog</span>
        </div>

        <div className="card-b">
          {productsQ.isLoading ? (
            <p className="hint" style={{ margin: 0 }}>Loading…</p>
          ) : productsQ.isError ? (
            <p className="hint" style={{ margin: 0, color: 'var(--bad)' }}>{errorMessage(productsQ.error)}</p>
          ) : filtered.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>
              {apiProducts.length === 0 ? (isManager ? 'No products yet. Add your first product.' : 'No products yet.') : 'No products in this collection.'}
            </p>
          ) : (
            <div className="grid g3">
              {filtered.map(a => {
                const p = toProduct(a);
                return (
                  <div className="prod" key={a.id}>
                    {a.imageUrl ? (
                      <div className="art" style={{ padding: 0, overflow: 'hidden' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.imageUrl} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </div>
                    ) : (
                      <div
                        className="art"
                        dangerouslySetInnerHTML={{
                          __html: `<svg viewBox="0 0 150 110" fill="none" role="img" aria-label="${p.k}">${PRODUCT_ARTWORK[p.k]}</svg>`
                        }}
                      />
                    )}
                    <div className="in">
                      <b>{p.n}</b>
                      <div className="pr">
                        {p.p}
                        {p.old && <s>{p.old}</s>}
                      </div>
                      <span>{p.note}</span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '9px' }}>
                        <span className={`chip ${p.st === 'ok' ? 'ok' : 'w'}`}>
                          {p.st === 'ok' ? 'In catalog' : 'Hidden'}
                        </span>
                        <span className="hint" style={{ margin: 0 }}>{p.sku}</span>
                      </div>
                      {(canEditPrices || activeConversationId) && (
                        <div style={{ display: 'flex', gap: '6px', marginTop: '9px' }}>
                          {canEditPrices && (
                            <button className="btn sm" onClick={() => openProductForm(a)}>
                              {isManager ? 'Edit' : 'Edit price'}
                            </button>
                          )}
                          {activeConversationId && a.status === 'active' && (
                            <button className="btn sm" onClick={() => sendProductMessage(activeConversationId, a.id)}>
                              Send to chat
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="note i">
        <span className="ic">◈</span>
        <div>
          <b>Keep prices and photos up to date</b>
          Customers see the price, old price and photo exactly as saved here. Mark a product Hidden to keep it here while it is out of stock.
        </div>
      </div>
    </>
  );
}

/* ───────── Product form ───────── */

function ProductForm({
  product,
  collections,
  priceOnly,
  defaultCollectionId,
  onDone
}: {
  product: ApiProduct | null;
  collections: ProductCollection[];
  priceOnly: boolean;
  defaultCollectionId: string | null;
  onDone: () => void;
}) {
  const { addToast, reportError } = useApp();
  const save = useSaveProduct();
  const del = useDeleteProduct();
  const [name, setName] = useState(product?.name ?? '');
  const [collectionId, setCollectionId] = useState<string>(product?.collectionId ?? defaultCollectionId ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [price, setPrice] = useState(toMajor(product?.price.amountMinor));
  const [oldPrice, setOldPrice] = useState(toMajor(product?.oldPrice?.amountMinor));
  const [unit, setUnit] = useState(product?.priceUnit ?? '');
  const [note, setNote] = useState(product?.note ?? '');
  const [status, setStatus] = useState<'active' | 'hidden'>(product?.status ?? 'active');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(product?.imageUrl ?? null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency = product?.price.currency ?? 'LKR';

  const handleSave = () => {
    setError(null);
    const priceMinor = toMinor(price);
    if (priceMinor === null) {
      setError('Enter the price as a number, for example 18500.');
      return;
    }
    const oldMinor = oldPrice.trim() ? toMinor(oldPrice) : null;
    if (oldPrice.trim() && oldMinor === null) {
      setError('Enter the old price as a number, or leave it empty.');
      return;
    }
    let fields: Partial<ProductInput>;
    if (priceOnly) {
      fields = { priceMinor, oldPriceMinor: oldMinor };
    } else {
      if (!name.trim()) {
        setError('Enter a product name.');
        return;
      }
      fields = {
        name: name.trim(),
        collectionId: collectionId || null,
        sku: sku.trim(),
        priceMinor,
        oldPriceMinor: oldMinor,
        currency,
        priceUnit: unit.trim(),
        note: note.trim(),
        status,
        ...(removePhoto && !photo ? { imageFileId: null } : {})
      };
    }
    save.mutate(
      { id: product?.id, fields, photo: priceOnly ? null : photo },
      {
        onSuccess: p => {
          addToast(product ? `“${p.name}” updated.` : `“${p.name}” added to the catalog.`);
          onDone();
        },
        onError: err => setError(errorMessage(err))
      }
    );
  };

  return (
    <>
      <h2>{product ? (priceOnly ? `Price · ${product.name}` : `Edit ${product.name}`) : 'New product'}</h2>
      <p className="sub">
        {priceOnly ? 'You can change the price and the old (struck-out) price.' : 'Shown to customers when staff send it from a chat.'}
      </p>

      {!priceOnly && (
        <>
          <label className="f" htmlFor="pName">Name</label>
          <input className="f-in" id="pName" maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Pantry cupboard (per ft)" />

          <div className="f-row f2">
            <div>
              <label className="f" htmlFor="pCol">Collection</label>
              <select className="f-in" id="pCol" value={collectionId} onChange={e => setCollectionId(e.target.value)}>
                <option value="">No collection</option>
                {collections.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="f" htmlFor="pSku">SKU</label>
              <input className="f-in" id="pSku" maxLength={60} value={sku} onChange={e => setSku(e.target.value)} placeholder="KIT-PAN" />
            </div>
          </div>
        </>
      )}

      <div className="f-row f2">
        <div>
          <label className="f" htmlFor="pPrice">Price ({currency})</label>
          <input className="f-in" id="pPrice" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="18500" />
        </div>
        <div>
          <label className="f" htmlFor="pOld">Old price (optional)</label>
          <input className="f-in" id="pOld" inputMode="decimal" value={oldPrice} onChange={e => setOldPrice(e.target.value)} />
        </div>
      </div>
      {toMinor(price) !== null && (
        <p className="hint">
          Shows as {formatMoney(toMinor(price) ?? 0, currency)}
          {unit.trim() ? ` ${unit.trim()}` : ''}
          {oldPrice.trim() && toMinor(oldPrice) !== null ? ` · was ${formatMoney(toMinor(oldPrice) ?? 0, currency)}` : ''}
        </p>
      )}

      {!priceOnly && (
        <>
          <div className="f-row f2">
            <div>
              <label className="f" htmlFor="pUnit">Price unit</label>
              <input className="f-in" id="pUnit" maxLength={20} value={unit} onChange={e => setUnit(e.target.value)} placeholder="per ft" />
            </div>
            <div>
              <label className="f" htmlFor="pSt">Status</label>
              <select className="f-in" id="pSt" value={status} onChange={e => setStatus(e.target.value as 'active' | 'hidden')}>
                <option value="active">In catalog</option>
                <option value="hidden">Hidden</option>
              </select>
            </div>
          </div>

          <label className="f" htmlFor="pNote">Note</label>
          <textarea className="f-in" id="pNote" rows={2} maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder="Teak finish, soft-close hinges" />

          <label className="f">Photo</label>
          <div className="attb">
            <label className="btn sm">
              🖼 {photoUrl ? 'Change photo' : 'Add photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={e => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  setPhoto(f);
                  setPhotoUrl(URL.createObjectURL(f));
                  setRemovePhoto(false);
                }}
              />
            </label>
            {photoUrl && (
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setPhoto(null);
                  setPhotoUrl(null);
                  setRemovePhoto(true);
                }}
              >
                Remove photo
              </button>
            )}
          </div>
          <div className="att" style={{ minHeight: '10px', paddingTop: '6px' }}>
            {photoUrl ? (
              <span className="att-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt={name || 'Product photo'} />
              </span>
            ) : (
              <span className="hint" style={{ margin: 0 }}>No photo · the drawing is shown instead</span>
            )}
          </div>
          <p className="hint">JPG or PNG up to 5 MB.</p>
        </>
      )}

      {error && (
        <div className="note w" style={{ marginTop: '12px' }}>
          <span className="ic">⚠</span>
          <div>
            <b>Not saved</b>
            {error}
          </div>
        </div>
      )}

      <button className="btn pri" style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }} disabled={save.isPending} onClick={handleSave}>
        {save.isPending ? 'Saving…' : product ? 'Save changes' : 'Add product'}
      </button>

      {product && !priceOnly && (
        <button
          className="btn dgr"
          style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
          disabled={del.isPending}
          onClick={() => {
            if (!window.confirm(`Delete “${product.name}” from the catalog?`)) return;
            del.mutate(product.id, {
              onSuccess: () => {
                addToast(`“${product.name}” deleted.`);
                onDone();
              },
              onError: reportError
            });
          }}
        >
          Delete product
        </button>
      )}
    </>
  );
}

/* ───────── Collections ───────── */

function CollectionsManager() {
  const { addToast, reportError } = useApp();
  const collectionsQ = useCollections();
  const save = useSaveCollection();
  const del = useDeleteCollection();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Record<string, string>>({});
  const collections = collectionsQ.data ?? [];

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    save.mutate(
      { name, position: collections.length },
      {
        onSuccess: c => {
          setNewName('');
          addToast(`Collection “${c.name}” added.`);
        },
        onError: reportError
      }
    );
  };

  return (
    <>
      <h2>Collections</h2>
      <p className="sub">Group products, for example Kitchen, Bathroom and Wardrobes.</p>

      {collectionsQ.isLoading && <p className="hint">Loading…</p>}
      {!collectionsQ.isLoading && collections.length === 0 && <p className="hint">No collections yet.</p>}
      {collections.map(c => {
        const value = editing[c.id] ?? c.name;
        const changed = value.trim() !== c.name && value.trim().length > 0;
        return (
          <div key={c.id} className="list-row" style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
            <input className="f-in" value={value} maxLength={60} onChange={e => setEditing(prev => ({ ...prev, [c.id]: e.target.value }))} />
            <span className="hint" style={{ margin: 0, whiteSpace: 'nowrap' }}>{c.productCount} products</span>
            {changed && (
              <button
                className="btn sm pri"
                onClick={() =>
                  save.mutate(
                    { id: c.id, name: value.trim() },
                    {
                      onSuccess: u => {
                        setEditing(prev => {
                          const next = { ...prev };
                          delete next[c.id];
                          return next;
                        });
                        addToast(`Renamed to “${u.name}”.`);
                      },
                      onError: reportError
                    }
                  )
                }
              >
                Save
              </button>
            )}
            <button
              className="btn sm dgr"
              onClick={() => {
                if (!window.confirm(`Delete collection “${c.name}”? Its products stay in the catalog without a collection.`)) return;
                del.mutate(c.id, { onSuccess: () => addToast(`Collection “${c.name}” deleted.`), onError: reportError });
              }}
            >
              Delete
            </button>
          </div>
        );
      })}

      <label className="f" htmlFor="colNew">New collection</label>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          className="f-in"
          id="colNew"
          maxLength={60}
          value={newName}
          placeholder="Bathroom"
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') add();
          }}
        />
        <button className="btn pri" disabled={save.isPending || !newName.trim()} onClick={add}>
          Add
        </button>
      </div>
    </>
  );
}
