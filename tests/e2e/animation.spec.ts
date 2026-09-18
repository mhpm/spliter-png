import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

async function download(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const file = await pending;
  return readFile((await file.path())!);
}
async function extract(page: Page) {
  await page.goto('/');
  await page.getByLabel('PNG file').setInputFiles('tests/fixtures/sample.png');
  await page.getByRole('button', { name: 'Extract elements', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /Element \d+ name/ })).toHaveCount(6);
}
test('source selection, non-destructive resizing and flips update downloaded pixels', async ({
  page,
}) => {
  await extract(page);
  await page.getByRole('button', { name: 'Deselect all elements' }).click();
  await expect(page.getByRole('region', { name: 'Selected sprite tools' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle source element 1', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Deselect element 1', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const original = await download(page, 'Download PNG for element 1');
  await page.getByRole('button', { name: 'Flip horizontal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Flip horizontal', exact: true })).toBeEnabled();
  const flipped = await download(page, 'Download PNG for element 1');
  expect(await sharp(flipped).raw().toBuffer()).toEqual(
    await sharp(original).flop().raw().toBuffer(),
  );
  await page.getByRole('button', { name: 'Flip vertical', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Flip vertical', exact: true })).toBeEnabled();
  expect(
    await sharp(await download(page, 'Download PNG for element 1'))
      .raw()
      .toBuffer(),
  ).toEqual(await sharp(original).flop().flip().raw().toBuffer());
  await page.getByLabel('Sprite scale percent').fill('50');
  await page.getByRole('button', { name: 'Apply size' }).click();
  await expect(page.getByRole('button', { name: 'Apply size' })).toBeEnabled();
  const resized = await sharp(await download(page, 'Download PNG for element 1')).metadata();
  const originalSize = await sharp(original).metadata();
  expect(resized.width).toBe(Math.round(originalSize.width! / 2));
  expect(resized.height).toBe(Math.round(originalSize.height! / 2));
  await page.getByRole('button', { name: 'Reset edits' }).click();
  await expect(page.getByRole('button', { name: 'Reset edits' })).toBeEnabled();
  expect(await download(page, 'Download PNG for element 1')).toEqual(original);
});

test('animation ordering, playback, PNG sheet, JSON coordinates and GIF frames agree', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await extract(page);
  await page.getByRole('button', { name: 'Deselect all elements' }).click();
  for (const i of [1, 3])
    await page.getByRole('button', { name: `Toggle source element ${i}`, exact: true }).click();
  const first = await download(page, 'Download PNG for element 1');
  const third = await download(page, 'Download PNG for element 3');
  await page.getByRole('button', { name: 'Create animation' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Move frame later' }).click();
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByTestId('frame-counter')).toHaveText('Frame 3 / 3');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByLabel('Frames per second').fill('10');
  await page.getByLabel('Loop animation').uncheck();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(page.getByTestId('frame-counter')).toHaveText('Frame 2 / 2');
  await page.getByLabel('Columns', { exact: true }).fill('2');
  await page.screenshot({ path: 'test-results/animation-desktop.png', fullPage: true });
  const metadata = JSON.parse((await download(page, 'Download frame data (JSON)')).toString());
  expect(metadata.frames.map((f: { name: string }) => f.name)).toEqual([
    'sample_003',
    'sample_001',
  ]);
  expect(metadata.frames[0].duration).toBe(100);
  const sheet = await download(page, 'Download spritesheet PNG');
  const sheetSize = await sharp(sheet).metadata();
  expect(sheetSize.width).toBe(metadata.width);
  expect(sheetSize.height).toBe(metadata.height);
  for (const [i, png] of [third, first].entries()) {
    const f = metadata.frames[i];
    const cell = await sharp(sheet)
      .extract({
        left: f.frame.x + f.sprite.x,
        top: f.frame.y + f.sprite.y,
        width: f.sprite.w,
        height: f.sprite.h,
      })
      .raw()
      .toBuffer();
    expect(cell).toEqual(await sharp(png).raw().toBuffer());
  }
  const gif = await download(page, 'Download animated GIF');
  expect(gif.subarray(0, 6).toString()).toBe('GIF89a');
  const gifInfo = await sharp(gif, { animated: true }).metadata();
  expect(gifInfo.pages).toBe(2);
  expect(gifInfo.width).toBe(metadata.cellWidth);
  expect(gifInfo.pageHeight).toBe(metadata.cellHeight);
  expect(gifInfo.delay).toEqual([100, 100]);
  expect(gifInfo.hasAlpha).toBe(true);
  // Decode each GIF frame to catch disposal trails and lost transparency.
  for (let i = 0; i < 2; i++) {
    const decoded = await sharp(gif, { page: i, pages: 1 }).ensureAlpha().raw().toBuffer();
    const expected = await sharp(sheet)
      .extract({
        left: i * metadata.cellWidth,
        top: 0,
        width: metadata.cellWidth,
        height: metadata.cellHeight,
      })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const alpha = (bytes: Buffer) =>
      [...bytes].filter((_, index) => index % 4 === 3).map((value) => (value < 128 ? 0 : 255));
    expect(alpha(decoded)).toEqual(alpha(expected));
  }
  expect(errors).toEqual([]);
});

test('animation tools fit mobile and close returns to selected sprites', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await extract(page);
  await page.getByRole('button', { name: 'Create animation' }).click();
  await expect(page.getByRole('heading', { name: 'Animation studio' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dialog = page.getByRole('dialog');
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/animation-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Close animation studio' }).click();
  await expect(page.getByRole('button', { name: 'Create animation' })).toBeVisible();
});
