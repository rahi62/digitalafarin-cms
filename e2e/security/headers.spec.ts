import { expect, test } from '@playwright/test';

test('production login hydrates with fresh nonces and blocks untrusted inline scripts', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__cmsViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      (window as any).__cmsViolations.push(event.effectiveDirective);
    });
  });
  await page.route('**/cms/login', async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace('</body>',
      '<style id="cms-untrusted-style">body{--cms-injected-style: blocked}</style><script id="cms-untrusted-test">window.__cmsInjected = true</script></body>');
    await route.fulfill({ response, body: html });
  });
  const response = await page.goto('/cms/login');
  const headers = response!.headers();
  const csp = headers['content-security-policy'];
  expect(csp).toContain("'strict-dynamic'");
  const scriptPolicy = csp.split(';').find(part => part.trim().startsWith('script-src'))!;
  expect(scriptPolicy).not.toContain('unsafe-inline');
  expect(scriptPolicy).not.toContain('unsafe-eval');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-frame-options']).toBe('SAMEORIGIN');
  expect(headers['permissions-policy']).toContain('camera=()');
  expect(headers['cache-control']).toContain('no-store');
  expect(headers['strict-transport-security']).toBeUndefined();

  const nonces = await page.locator('script:not(#cms-untrusted-test)').evaluateAll(scripts => scripts.map(script => (script as HTMLScriptElement).nonce));
  expect(nonces.length).toBeGreaterThan(0);
  const nonce = /'nonce-([^']+)'/.exec(csp)![1];
  expect(nonces.every(value => value === nonce)).toBe(true);
  const second = await page.request.get('/cms/login', {
    headers: { 'x-nonce': 'attacker-controlled', 'content-security-policy': "script-src 'unsafe-inline'" },
  });
  const secondPolicy = second.headers()['content-security-policy'];
  expect(secondPolicy).not.toContain('attacker-controlled');
  expect(/'nonce-([^']+)'/.exec(secondPolicy)![1]).not.toBe(nonce);

  await page.locator('input[autocomplete="username"]').fill('hydration-check');
  await page.locator('input[autocomplete="current-password"]').fill('test-only');
  await expect(page.getByRole('button', { name: 'ورود', exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as any).__cmsViolations)).toContain('script-src-elem');
  expect(await page.evaluate(() => (window as any).__cmsInjected)).toBeUndefined();
  await expect.poll(() => page.evaluate(() => (window as any).__cmsViolations)).toContain('style-src-elem');
  expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--cms-injected-style'))).toBe('');
});

test('production rich text editor receives a usable nonced stylesheet', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cms_access_token', 'csp-test-only');
    (window as any).__cmsStyleViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      if (event.effectiveDirective.startsWith('style-src')) {
        (window as any).__cmsStyleViolations.push(event.effectiveDirective);
      }
    });
  });
  await page.route('**/cms/api-proxy/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const results = path.endsWith('/sites/') ? [{ id: 'site-csp', name: 'CSP fixture' }]
      : path.endsWith('/content/types/') ? [{ id: 'type-csp', site: 'site-csp', name: 'Page', slug: 'page', kind: 'collection', schema: { fields: [] } }]
      : [];
    await route.fulfill({ json: { count: results.length, results, next: null, previous: null } });
  });
  const response = await page.goto('/cms/content/new');
  const nonce = /'nonce-([^']+)'/.exec(response!.headers()['content-security-policy'])![1];
  const canvas = page.locator('.cmsRichTextCanvas');
  await expect(canvas).toBeVisible();
  const style = await page.locator('style[data-tiptap-style]').evaluate((node: HTMLStyleElement) => ({
    nonce: node.nonce, rules: node.sheet?.cssRules.length || 0,
  }));
  expect(style.nonce).toBe(nonce);
  expect(style.rules).toBeGreaterThan(0);
  await canvas.fill('متن امن در ویرایشگر');
  await expect(canvas).toContainText('متن امن در ویرایشگر');
  expect(await page.evaluate(() => (window as any).__cmsStyleViolations)).toEqual([]);
});
