import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

test('upload, extract, inspect, rename and download six intact PNGs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await page.screenshot({ path: 'test-results/desktop-empty.png', fullPage: true });
  await expect(page.getByRole('button', { name: 'Download ZIP' })).toBeDisabled();
  await page.getByLabel('PNG file').setInputFiles('tests/fixtures/sample.png');
  await page.getByRole('button', { name: 'Extract elements', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /Element \d+ name/ })).toHaveCount(6);
  await page.screenshot({ path: 'test-results/desktop-results.png', fullPage: true });
  await page.getByRole('button', { name: 'Enlarge element 1', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close preview' }).click();
  await page
    .getByRole('textbox', { name: 'Element 1 name', exact: true })
    .fill('green piece');
  await page
    .getByRole('textbox', { name: 'Element 2 name', exact: true })
    .fill('green piece');
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Element 2 name', exact: true }).fill('circle');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download ZIP/ }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('sample_elements.zip');
  const files = unzipSync(await readFile((await download.path())!));
  expect(Object.keys(files)).toHaveLength(6);
  expect(files['green piece.png']).toBeDefined();
  expect(files['circle.png']).toBeDefined();
  for (const bytes of Object.values(files))
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await expect(page.getByText('Your ZIP is ready. Check your downloads.')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('empty results, opaque warning, re-extraction and file validation', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('PNG file').setInputFiles('tests/fixtures/transparent.png');
  await page.getByRole('button', { name: 'Extract elements', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No elements found' })).toBeVisible();
  await page.getByLabel('PNG file').setInputFiles('tests/fixtures/opaque.png');
  await page.getByRole('button', { name: 'Extract elements', exact: true }).click();
  await expect(page.getByText(/This PNG has no transparency/)).toBeVisible();
  await page.getByText('More settings', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Padding', exact: true }).fill('8');
  await page.getByRole('textbox', { name: 'Padding', exact: true }).press('Tab');
  await expect(page.getByText(/Pending settings/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Re-extract', exact: true }).click();
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toBeEnabled();
  await page
    .getByLabel('PNG file')
    .setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert')).toContainText('valid PNG');
});

test('mobile workflow stays within viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('PNG file').setInputFiles('tests/fixtures/sample.png');
  await page.getByRole('button', { name: 'Extract elements', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /Element \d+ name/ })).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toBeEnabled();
  await page.screenshot({ path: 'test-results/mobile-results.png', fullPage: true });
});

test('16 megapixel input can be cancelled, retried and replaced without stale results', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('PNG file').setInputFiles('tests/fixtures/large.png');
  await page.getByRole('button', { name: 'Extract elements', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Extract elements', exact: true })).toBeEnabled();
  const started = Date.now();
  await page.getByRole('button', { name: 'Extract elements', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /Element \d+ name/ })).toHaveCount(4, {
    timeout: 15000,
  });
  console.log(`16 MP extraction: ${Date.now() - started} ms`);
  await page.getByLabel('PNG file').setInputFiles('tests/fixtures/sample.png');
  await page.getByRole('button', { name: 'Extract elements', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /Element \d+ name/ })).toHaveCount(6);
  await expect(
    page.getByRole('textbox', { name: 'Element 1 name', exact: true }),
  ).toHaveValue('sample_001');
});

test('user can select and deselect elements to download only chosen pieces', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('PNG file').setInputFiles('tests/fixtures/sample.png');
  await page.getByRole('button', { name: 'Extract elements', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /Element \d+ name/ })).toHaveCount(6);

  // All 6 items start selected
  await expect(page.getByText('6 of 6 selected')).toBeVisible();
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toContainText('6');

  // Deselect all
  await page.getByRole('button', { name: 'Deselect all' }).click();
  await expect(page.getByText('0 of 6 selected')).toBeVisible();
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toBeDisabled();
  await expect(page.getByText('Select at least one element to download.')).toBeVisible();

  // Select only item 1 and item 3
  await page.getByRole('button', { name: 'Select element 1' }).click();
  await page.getByRole('button', { name: 'Select element 3' }).click();
  await expect(page.getByText('2 of 6 selected')).toBeVisible();
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toContainText('2');

  // Download ZIP and verify only the 2 selected items are present
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download ZIP/ }).click();
  const download = await downloadEvent;
  const files = unzipSync(await readFile((await download.path())!));
  expect(Object.keys(files)).toHaveLength(2);
  expect(files['sample_001.png']).toBeDefined();
  expect(files['sample_003.png']).toBeDefined();
  expect(files['sample_002.png']).toBeUndefined();

  // Test individual PNG quick download button on element 2
  const singleDownloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG for element 2' }).click();
  const singleDownload = await singleDownloadEvent;
  expect(singleDownload.suggestedFilename()).toBe('sample_002.png');
});
