import { test, expect } from '@playwright/test';

test('real host: draft preview, images, publish, list/detail, move, unpublish and legacy fallback', async ({ page, request }) => {
  const api = 'http://127.0.0.1:8197/api/cms/v1';
  const auth = await (await request.post(api + '/auth/token/', { data: { username: 'host-owner', password: 'fixture-password' } })).json();
  const headers = { Authorization: `Bearer ${auth.access}` };
  const sites = await (await request.get(api + '/sites/', { headers })).json();
  const site = sites.results[0];
  const types = await (await request.get(api + '/content/types/', { headers })).json();
  const kind = types.results.find((item: any) => item.slug === 'news');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Original host homepage' })).toBeVisible();
  await page.goto('/blog/legacy');
  await expect(page.getByRole('heading', { name: 'Original legacy article' })).toBeVisible();
  await page.goto('/blog?cms_source=legacy');
  await expect(page.getByRole('heading', { name: 'Original legacy collection' })).toBeVisible();

  const upload = await request.post(api + '/media/assets/', { headers, multipart: {
    site: site.id, title: 'Fixture image', alt_text: 'Uploaded image',
    file: { name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=', 'base64') },
  } });
  expect(upload.status()).toBe(201);
  const media = await upload.json();
  const created = await request.post(api + '/content/entries/', { headers, data: {
    site: site.id, content_type: kind.id, title: 'CMS Persian article', slug: 'مقاله', path: '/blog/',
    blocks: [{ type: 'image', data: { src: media.url, alt: 'Uploaded image' } }, { type: 'rich_text', data: { format: 'tiptap-json', version: 1,
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rich text body' }] }, { type: 'image', attrs: { src: media.url, alt: 'Rich image' } }] }, html: '', text: 'Rich text body' } }],
    custom_fields: { featured_image: media.url },
  } });
  expect(created.status()).toBe(201);
  const entry = await created.json();
  expect(entry.path).toBe('/blog/مقاله/');
  const listing = () => request.get(api + '/content/public-entries/?site=127.0.0.1:3197');
  expect((await (await listing()).json()).count).toBe(0);
  const preview = await (await request.post(`${api}/content/entries/${entry.id}/preview/`, { headers })).json();
  const previewResponse = await page.goto(preview.frontend_url);
  await expect(page.getByRole('heading', { name: entry.title })).toBeVisible();
  expect(previewResponse?.headers()['referrer-policy']).toBe('no-referrer');
  expect(previewResponse?.headers()['cache-control']).toContain('no-store');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect.poll(() => page.getByAltText('Uploaded image').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => page.getByAltText('Rich image').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const home = (await (await request.get(api + '/content/entries/', { headers })).json()).results.find((item: any) => item.path === '/');
  const homePreview = await (await request.post(`${api}/content/entries/${home.id}/preview/`, { headers })).json();
  await page.goto(homePreview.frontend_url);
  await expect(page.getByRole('heading', { name: 'Draft homepage' })).toBeVisible();

  await page.addInitScript((token) => localStorage.setItem('cms_access_token', token), auth.access);
  await page.goto(`/cms/content/${entry.id}`);
  await expect.poll(() => page.locator('.tiptap img').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('output')).toContainText(entry.path);

  expect((await request.post(`${api}/content/entries/${entry.id}/publish/`, { headers })).ok()).toBeTruthy();
  await page.goto('/blog');
  await expect(page.getByRole('link', { name: entry.title })).toHaveAttribute('href', entry.path);
  await page.getByRole('link', { name: entry.title }).click();
  await expect(page.getByRole('heading', { name: entry.title })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'http://127.0.0.1:3197' + encodeURI(entry.path));
  expect((await request.get('/media/does-not-exist.png')).status()).toBe(404);
  expect((await request.get('/blog/does-not-exist')).status()).toBe(404);
  await page.goto(entry.path + '?cms_preview=invalid');
  await expect(page.getByRole('alert')).toContainText('invalid, expired');
  await expect(page.getByRole('heading', { name: entry.title })).toHaveCount(0);
  const changed = await request.patch(`${api}/content/entries/${entry.id}/`, { headers, data: { slug: 'renamed', title: 'Changed immediately' } });
  expect(changed.ok()).toBeTruthy();
  await page.goto(entry.path);
  await expect(page).toHaveURL(/\/blog\/renamed\/?$/);
  await expect(page.getByRole('heading', { name: 'Changed immediately' })).toBeVisible();
  await request.post(`${api}/content/entries/${entry.id}/return-draft/`, { headers });
  expect((await (await listing()).json()).count).toBe(0);
  expect((await request.get('/blog/renamed')).status()).toBe(404);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Original host homepage' })).toBeVisible();
});
