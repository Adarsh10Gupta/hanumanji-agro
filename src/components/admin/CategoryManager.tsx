'use client';

import { FormEvent, useEffect, useState } from 'react';

type Cat = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  displayOrder: number;
  published: boolean;
};

type CategoryPage = { categories: Cat[]; total: number; page: number; pages: number };

export default function CategoryManager({ initial, total, pageSize }: { initial: Cat[]; total: number; pageSize: number }) {
  const [rows, setRows] = useState(initial);
  const [categoryOptions, setCategoryOptions] = useState<Cat[]>(initial);
  const [categoryTotal, setCategoryTotal] = useState(total);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(Math.ceil(total / pageSize));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [replacement, setReplacement] = useState<Record<string, string>>({});
  const [replacementText, setReplacementText] = useState<Record<string, string>>({});

  async function loadPage(nextPage: number) {
    const response = await fetch(`/api/admin/categories?page=${nextPage}`);
    const result = await response.json() as CategoryPage;
    if (!response.ok) throw new Error(result && 'error' in result ? String((result as unknown as { error: string }).error) : 'Unable to load categories.');
    setRows(result.categories);
    setPage(result.page);
    setPages(result.pages);
    setCategoryTotal(result.total);
    return result;
  }

  async function searchCategoryOptions(query: string, targetId?: string) {
    const response = await fetch(`/api/admin/categories?search=${encodeURIComponent(query)}&page=1`);
    const result = await response.json() as CategoryPage;
    if (!response.ok) throw new Error('Unable to search replacement categories.');
    setCategoryOptions(result.categories);
    if (targetId) {
      const match = result.categories.find((item) => item.name === query && item._id !== targetId);
      setReplacement((current) => ({ ...current, [targetId]: match?._id || '' }));
    }
  }

  async function save(event: FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = {
      name: String(form.get('name')),
      slug: String(form.get('slug')),
      description: String(form.get('description') || ''),
      image: String(form.get('image') || ''),
      displayOrder: Number(form.get('displayOrder') || 0),
      published: form.get('published') === 'on',
    };
    const response = await fetch(id ? `/api/admin/categories/${id}` : '/api/admin/categories', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) { setError(result.error); return; }
    setError('');
    setMessage('Category saved.');
    if (id) {
      setRows((current) => current.map((category) => category._id === id ? { ...category, ...data } : category));
    } else {
      await loadPage(1);
    }
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>, form: HTMLFormElement) {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    body.append('kind', 'category');
    const response = await fetch('/api/admin/uploads', { method: 'POST', body });
    const result = await response.json();
    if (response.ok) (form.elements.namedItem('image') as HTMLInputElement).value = result.url;
    else setError(result.error || 'Image upload failed.');
  }

  async function remove(category: Cat) {
    if (!window.confirm(`Delete “${category.name}”?`)) return;
    const response = await fetch(`/api/admin/categories/${category._id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reassignTo: replacement[category._id] || undefined }),
    });
    const result = await response.json();
    if (!response.ok) { setError(result.error); return; }
    const remaining = rows.filter((item) => item._id !== category._id);
    setRows(remaining);
    const nextTotal = Math.max(0, categoryTotal - 1);
    const nextPages = Math.ceil(nextTotal / pageSize);
    setCategoryTotal(nextTotal);
    setPages(nextPages);
    if (!remaining.length && page > 1) await loadPage(Math.min(page - 1, Math.max(1, nextPages)));
    setError('');
    setMessage('Category deleted.');
  }

  return <div className="category-manager">
    <form className="admin-panel category-new" onSubmit={(event) => save(event)}>
      <small>NEW CATEGORY</small><h2>Create a category</h2>
      <div className="admin-form-grid">
        <label>Name<input name="name" required /></label>
        <label>Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label>
        <label>Display order<input name="displayOrder" type="number" min="0" defaultValue="0" /></label>
      </div>
      <label>Description<textarea name="description" /></label><label>Image URL<input name="image" type="url" /></label>
      <label><input name="published" type="checkbox" defaultChecked /> Published</label>
      <button className="admin-primary">Create category</button>
    </form>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {message && <p className="admin-feedback" role="status">{message}</p>}
    <div className="category-list">{rows.map((category) => <form className="admin-panel category-card" key={category._id} onSubmit={(event) => save(event, category._id)}>
      <div className="category-card-head">
        {category.image ? <img src={category.image} alt="" /> : <span className="category-placeholder">CAT</span>}
        <div><small>DISPLAY ORDER {category.displayOrder}</small><strong>{category.name}</strong></div>
        <label className="category-publish"><input name="published" type="checkbox" defaultChecked={category.published} /> Public</label>
      </div>
      <div className="admin-form-grid">
        <label>Name<input name="name" defaultValue={category.name} required /></label>
        <label>Slug<input name="slug" defaultValue={category.slug} required /></label>
        <label>Display order<input name="displayOrder" type="number" min="0" defaultValue={category.displayOrder} /></label>
      </div>
      <label>Description<textarea name="description" defaultValue={category.description} /></label>
      <label>Image URL<input name="image" type="url" defaultValue={category.image} /></label>
      <label className="admin-upload-button">Upload category image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => upload(event, event.currentTarget.form!)} /></label>
      <div className="admin-form-actions">
        <button className="admin-primary">Save category</button>
        <input
          list={`replacement-categories-${category._id}`}
          value={replacementText[category._id] ?? (replacement[category._id] ? categoryOptions.find((item) => item._id === replacement[category._id])?.name || '' : '')}
          placeholder="Reassign products to…"
          onFocus={() => searchCategoryOptions('').catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Unable to search categories.'))}
          onChange={(event) => {
            const name = event.target.value;
            setReplacementText({ ...replacementText, [category._id]: name });
            const match = categoryOptions.find((item) => item.name === name && item._id !== category._id);
            setReplacement({ ...replacement, [category._id]: match?._id || '' });
            searchCategoryOptions(name, category._id).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Unable to search categories.'));
          }}
        />
        <datalist id={`replacement-categories-${category._id}`}>
          {categoryOptions.filter((item) => item._id !== category._id).map((item) => <option key={item._id} value={item.name} />)}
        </datalist>
        <button type="button" className="admin-danger" onClick={() => remove(category)}>Delete</button>
      </div>
    </form>)}</div>
    {pages > 1 && <nav className="admin-pagination" aria-label="Category pages">
      <button type="button" disabled={page <= 1} onClick={() => loadPage(page - 1).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Unable to load categories.'))}>Previous</button>
      <span>Page {page} of {pages} · {categoryTotal} categories</span>
      <button type="button" disabled={page >= pages} onClick={() => loadPage(page + 1).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Unable to load categories.'))}>Next</button>
    </nav>}
  </div>;
}
