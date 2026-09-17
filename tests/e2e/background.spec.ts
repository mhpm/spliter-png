import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

async function openEditor(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: /Remove Background/ }).click();
  await expect(page.getByRole('heading', { name: 'Element Extractor' })).not.toBeVisible();
  await page.getByLabel('Choose photo', { exact: true }).setInputFiles('tests/fixtures/opaque.png');
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
}
async function alphaAt(page: Page, x = 32, y = 32) {
  return page
    .locator('.editor-image-stage canvas')
    .evaluate(
      (node, point) =>
        (node as HTMLCanvasElement).getContext('2d')!.getImageData(point.x, point.y, 1, 1).data[3],
      { x, y },
    );
}

test('brush, undo, redo, recovery, preview and transparent PNG export', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') uploads.push(request.url());
  });
  await openEditor(page);
  const canvas = page.locator('.editor-image-stage canvas');
  const box = (await canvas.boundingBox())!;
  const dimensions = await canvas.evaluate((node) => ({
    width: (node as HTMLCanvasElement).width,
    height: (node as HTMLCanvasElement).height,
  }));
  const point = {
    x: (32 / dimensions.width) * box.width,
    y: (32 / dimensions.height) * box.height,
  };
  await canvas.click({ position: point });
  await expect.poll(() => alphaAt(page)).toBe(0);
  await page.getByRole('button', { name: 'Undo edit' }).click();
  await expect.poll(() => alphaAt(page)).toBe(255);
  await page.getByRole('button', { name: 'Redo edit' }).click();
  await expect.poll(() => alphaAt(page)).toBe(0);
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect.poll(() => alphaAt(page)).toBe(255);
  await page.getByRole('button', { name: 'Result', exact: true }).click();
  await expect.poll(() => alphaAt(page)).toBe(0);
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await canvas.click({ position: point });
  await expect.poll(() => alphaAt(page)).toBe(255);
  await page.getByRole('button', { name: 'Undo edit' }).click();
  await page.getByText('Fine-tune & export', { exact: true }).click();
  await page.getByLabel('File name', { exact: true }).fill('../bad');
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeDisabled();
  await page.getByLabel('File name', { exact: true }).fill('my-cutout');
  await page.getByRole('button', { name: 'dark preview background' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('my-cutout.png');
  const { data, info } = await sharp(await readFile((await download.path())!))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(info.width).toBe(dimensions.width);
  expect(info.height).toBe(dimensions.height);
  expect(data[(32 * info.width + 32) * 4 + 3]).toBe(0);
  expect(data[3]).toBe(255);
  await page.screenshot({ path: 'test-results/background-editor.png', fullPage: true });
  await page.getByRole('tab', { name: 'Extract Elements' }).click();
  await page.getByLabel('PNG file').setInputFiles('tests/fixtures/sample.png');
  await page.getByRole('button', { name: 'Extract elements', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /Element \d+ name/ })).toHaveCount(6);
  await page.getByRole('tab', { name: /Remove Background/ }).click();
  await expect(page.getByLabel('File name', { exact: true })).toHaveValue('my-cutout');
  await expect.poll(() => alphaAt(page)).toBe(0);
  expect(errors).toEqual([]);
  expect(uploads).toEqual([]);
});

test('mobile, keyboard brush, selection points and invalid inputs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const canvas = page.locator('.editor-image-stage canvas');
  await canvas.focus();
  await canvas.press('Space');
  await expect(page.getByRole('button', { name: 'Undo edit' })).toBeEnabled();
  await page.getByRole('button', { name: 'Select objects', exact: true }).click();
  await page.getByRole('button', { name: 'Keep object', exact: true }).click();
  await canvas.focus();
  await canvas.press('Space');
  await expect(page.getByRole('button', { name: 'Apply selection' })).toBeEnabled();
  await expect(page.locator('.selection-point.keep')).toHaveCount(1);
  await page.getByRole('button', { name: 'Exclude area', exact: true }).click();
  await canvas.press('ArrowLeft');
  await canvas.press('Space');
  await expect(page.locator('.selection-point.exclude')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo point', exact: true }).click();
  await expect(page.locator('.selection-point.exclude')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/background-mobile.png', fullPage: true });
  await page.getByLabel('Choose photo', { exact: true }).setInputFiles({
    name: 'fake.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.getByRole('alert')).toContainText('valid PNG, JPG, or WebP');
});

test('model download cancellation preserves edits and remains usable offline', async ({ page }) => {
  await page.route('https://huggingface.co/**', (route) => route.abort());
  await openEditor(page);
  await page.getByRole('button', { name: 'Auto remove background' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Auto remove background' })).toBeEnabled();
  const canvas = page.locator('.editor-image-stage canvas');
  await canvas.focus();
  await canvas.press('Space');
  await expect(page.getByRole('button', { name: 'Undo edit' })).toBeEnabled();
});

test('real automatic and prompted segmentation @ai', async ({ page }) => {
  test.skip(process.env.RUN_AI_TESTS !== '1', 'Opt-in network/model integration check');
  test.setTimeout(300_000);
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('Browser:', message.text());
  });
  page.on('worker', (worker) => worker.on('close', () => console.log('AI worker closed')));
  await openEditor(page);
  await page
    .getByLabel('Choose photo', { exact: true })
    .setInputFiles('.sites-runtime/ai-photo.jpg');
  await expect(page.getByRole('button', { name: 'Auto remove background' })).toBeEnabled();
  await page.getByRole('button', { name: 'Auto remove background' }).click();
  await expect(page.getByRole('button', { name: 'Auto remove background' })).toBeEnabled({
    timeout: 240_000,
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(
    page.getByText('Background removed. Check the edges and refine with the brushes.'),
  ).toBeVisible();
  const stats = () =>
    page.locator('.editor-image-stage canvas').evaluate((node) => {
      const c = node as HTMLCanvasElement;
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let clear = 0,
        solid = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 20) clear++;
        if (data[i] > 230) solid++;
      }
      return { clear, solid };
    });
  expect((await stats()).clear).toBeGreaterThan(1000);
  expect((await stats()).solid).toBeGreaterThan(1000);
  await page.screenshot({ path: 'test-results/ai-auto.png', fullPage: true });
  await page.getByRole('button', { name: 'Select objects', exact: true }).click();
  await page.getByRole('button', { name: 'Keep object' }).click();
  const canvas = page.locator('.editor-image-stage canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await page.getByRole('button', { name: 'Apply selection' }).click();
  await expect(page.getByRole('button', { name: 'Auto remove background' })).toBeEnabled({
    timeout: 120_000,
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await stats()).clear).toBeGreaterThan(1000);
  expect((await stats()).solid).toBeGreaterThan(1000);
  await page.screenshot({ path: 'test-results/ai-selection.png', fullPage: true });
});
