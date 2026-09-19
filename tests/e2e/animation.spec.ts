import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

async function download(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  let openedExportModal = false;
  const btn = page.getByRole('button', { name, exact: true });
  if (!(await btn.isVisible().catch(() => false))) {
    const exportBtn = page.getByRole('button', { name: 'Export', exact: true }).first();
    if (await exportBtn.isVisible().catch(() => false)) {
      await exportBtn.click();
      openedExportModal = true;
    }
  }
  await btn.click();
  const file = await pending;
  if (openedExportModal) {
    const closeBtn = page.getByRole('button', { name: 'Close export dialog' });
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    }
  }
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
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.animation-preview-panel .animation-timeline')).toHaveCount(1);
  await page.getByRole('button', { name: 'Move selected frame right' }).click();
  await page.getByRole('button', { name: 'Duplicate selected frame' }).click();
  await expect(page.getByTestId('frame-counter')).toHaveText('Frame 3 / 3');
  await page.getByRole('button', { name: 'Delete selected frame' }).click();
  const animTab = page.getByRole('tab', { name: /Animation/i });
  if (await animTab.isVisible().catch(() => false)) {
    await animTab.click();
  }
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
  await page.screenshot({ path: 'screenshots/animation-desktop.png' });
  expect(errors).toEqual([]);
});

test('frames can be reordered and layers can be dropped into another frame', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await extract(page);
  await page.getByRole('button', { name: 'Deselect all elements' }).click();
  for (const i of [1, 2])
    await page.getByRole('button', { name: `Toggle source element ${i}`, exact: true }).click();
  await page.getByRole('button', { name: 'Create animation' }).click();

  const frameTiles = page.locator('.frame-tile');
  await frameTiles.nth(1).dragTo(frameTiles.nth(0), { targetPosition: { x: 4, y: 24 } });
  await expect(frameTiles.nth(0)).toContainText('sample_002');

  await page.locator('.sidebar-layer-card').first().dragTo(frameTiles.nth(1));
  await expect(page.getByText(/Layers in Frame 2 \(2\)/)).toBeVisible();
});

test('frames can be dropped on the preview or layers column to become new layers', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await extract(page);
  await page.getByRole('button', { name: 'Deselect all elements' }).click();
  for (const i of [1, 2])
    await page.getByRole('button', { name: `Toggle source element ${i}`, exact: true }).click();
  await page.getByRole('button', { name: 'Create animation' }).click();

  const frameTiles = page.locator('.frame-tile');
  await frameTiles.nth(1).dragTo(page.locator('.animation-stage'));
  await expect(page.getByText(/Layers in Frame 1 \(2\)/)).toBeVisible();

  await frameTiles.nth(1).click();
  await frameTiles.nth(0).dragTo(page.locator('.layers-container'));
  await expect(page.getByText(/Layers in Frame 2 \(2\)/)).toBeVisible();
});

test('animation tools fit mobile and close returns to selected sprites', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await extract(page);
  await page.getByRole('button', { name: 'Create animation' }).click();
  await expect(page.getByRole('heading', { name: 'Animation studio' })).toBeVisible();
  await page.getByRole('button', { name: 'Spritesheet', exact: true }).click();
  await expect(page.locator('.spritesheet-preview-grid')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Preview sheet frame 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview sheet frame 2' })).toBeVisible();
  await expect(page.locator('.preview-sheet-frame')).toHaveCount(6);
  await page.getByRole('button', { name: 'Animation', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dialog = page.getByRole('dialog');
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'screenshots/animation-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Close animation studio' }).click();
  await expect(page.getByRole('button', { name: 'Create animation' })).toBeVisible();
});

test('a selected sprite resizes proportionally by dragging a corner and can be undone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await extract(page);
  await page.getByRole('button', { name: 'Deselect all elements' }).click();
  await page.getByRole('button', { name: 'Toggle source element 1', exact: true }).click();
  await page.getByRole('button', { name: 'Create animation' }).click();

  const layer = page.locator('.stage-layer-element[data-layer-index="0"]');
  const handle = page.getByRole('button', { name: /Resize .* from br/ });
  const before = await layer.boundingBox();
  const corner = await handle.boundingBox();
  expect(before).not.toBeNull();
  expect(corner).not.toBeNull();

  await page.mouse.move(corner!.x + corner!.width / 2, corner!.y + corner!.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner!.x + corner!.width / 2 + 45, corner!.y + corner!.height / 2 + 45, {
    steps: 6,
  });
  await page.mouse.up();

  const after = await layer.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.width).toBeGreaterThan(before!.width);
  expect(after!.height).toBeGreaterThan(before!.height);
  expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(3);
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(3);
  expect(Number(await page.getByLabel('Layer width in pixels').inputValue())).toBeGreaterThan(
    before!.width,
  );

  await page.getByRole('button', { name: 'Undo' }).click();
  const restored = await layer.boundingBox();
  expect(restored).not.toBeNull();
  expect(Math.abs(restored!.width - before!.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(restored!.height - before!.height)).toBeLessThanOrEqual(1);

  const rightHandle = page.getByRole('button', { name: /Resize width from right edge/ });
  const rightEdge = await rightHandle.boundingBox();
  expect(rightEdge).not.toBeNull();
  await page.mouse.move(
    rightEdge!.x + rightEdge!.width / 2,
    rightEdge!.y + rightEdge!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    rightEdge!.x + rightEdge!.width / 2 + 40,
    rightEdge!.y + rightEdge!.height / 2,
    { steps: 6 },
  );
  await page.mouse.up();

  const stretched = await layer.boundingBox();
  expect(stretched).not.toBeNull();
  expect(stretched!.width).toBeGreaterThan(restored!.width);
  expect(Math.abs(stretched!.height - restored!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(stretched!.x - restored!.x)).toBeLessThanOrEqual(2);

  const widthInput = page.getByLabel('Layer width in pixels');
  const heightInput = page.getByLabel('Layer height in pixels');
  const widthBeforeManualHeight = Number(await widthInput.inputValue());
  const heightBeforeManualHeight = Number(await heightInput.inputValue());
  await page.getByRole('button', { name: 'Unlock aspect ratio' }).click();
  await heightInput.fill(String(heightBeforeManualHeight + 20));
  await heightInput.press('Enter');
  await expect(heightInput).toHaveValue(String(heightBeforeManualHeight + 20));
  await expect(widthInput).toHaveValue(String(widthBeforeManualHeight));

  const inspector = page.locator('.animation-settings');
  await expect(inspector.getByLabel('Rotation in degrees')).toBeVisible();
  await expect(inspector.getByRole('button', { name: /Flip/ })).toHaveCount(0);
});

test('a draggable pivot stays fixed while the selected sprite rotates around it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await extract(page);
  await page.getByRole('button', { name: 'Deselect all elements' }).click();
  await page.getByRole('button', { name: 'Toggle source element 1', exact: true }).click();
  await page.getByRole('button', { name: 'Create animation' }).click();

  const layer = page.locator('.stage-layer-element[data-layer-index="0"]');
  const pivot = page.getByRole('button', { name: /Move rotation pivot/ });
  const layerBefore = await layer.boundingBox();
  const pivotAtCenter = await pivot.boundingBox();
  expect(layerBefore).not.toBeNull();
  expect(pivotAtCenter).not.toBeNull();

  await page.mouse.move(
    pivotAtCenter!.x + pivotAtCenter!.width / 2,
    pivotAtCenter!.y + pivotAtCenter!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    pivotAtCenter!.x + pivotAtCenter!.width / 2 + layerBefore!.width / 3,
    pivotAtCenter!.y + pivotAtCenter!.height / 2,
    { steps: 6 },
  );
  await page.mouse.up();

  const pivotBeforeRotation = await pivot.boundingBox();
  expect(pivotBeforeRotation).not.toBeNull();
  const fixedPoint = {
    x: pivotBeforeRotation!.x + pivotBeforeRotation!.width / 2,
    y: pivotBeforeRotation!.y + pivotBeforeRotation!.height / 2,
  };

  await page.getByRole('button', { name: '+90°', exact: true }).first().click();

  const pivotAfterRotation = await pivot.boundingBox();
  const layerAfterRotation = await layer.boundingBox();
  expect(pivotAfterRotation).not.toBeNull();
  expect(layerAfterRotation).not.toBeNull();
  expect(
    Math.abs(pivotAfterRotation!.x + pivotAfterRotation!.width / 2 - fixedPoint.x),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(pivotAfterRotation!.y + pivotAfterRotation!.height / 2 - fixedPoint.y),
  ).toBeLessThanOrEqual(2);
  expect(Math.abs(layerAfterRotation!.x - layerBefore!.x)).toBeGreaterThan(5);

  await page.getByRole('button', { name: 'Center pivot' }).click();
  const centeredPivot = await pivot.boundingBox();
  const centeredLayer = await layer.boundingBox();
  expect(centeredPivot).not.toBeNull();
  expect(centeredLayer).not.toBeNull();
  expect(
    Math.abs(
      centeredPivot!.x + centeredPivot!.width / 2 -
        (centeredLayer!.x + centeredLayer!.width / 2),
    ),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(
      centeredPivot!.y + centeredPivot!.height / 2 -
        (centeredLayer!.y + centeredLayer!.height / 2),
    ),
  ).toBeLessThanOrEqual(2);
});

test('animation studio sprite manipulation, layers combining, and composite export', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await extract(page);

  // Select first 2 elements and open animation studio
  await page.getByRole('button', { name: 'Deselect all elements' }).click();
  for (const i of [1, 2])
    await page.getByRole('button', { name: `Toggle source element ${i}`, exact: true }).click();
  await page.getByRole('button', { name: 'Create animation' }).click();
  await expect(page.getByRole('heading', { name: 'Animation studio' })).toBeVisible();

  // Test transformation controls on active sprite
  await page.getByRole('button', { name: 'Flip H', exact: true }).click();
  await page.getByRole('button', { name: '+90°' }).first().click();
  const widthInput = page.getByLabel('Layer width in pixels');
  const initialWidth = Number(await widthInput.inputValue());
  await widthInput.fill(String(Math.round(initialWidth * 1.5)));
  await widthInput.press('Enter');
  await expect(widthInput).toHaveValue(String(Math.round(initialWidth * 1.5)));
  const scaleSlider = page.getByLabel('Scale percentage');
  await scaleSlider.fill('150');
  await expect(page.getByText('Scale: 150%')).toBeVisible();
  const rotationSlider = page.getByLabel('Rotation slider');
  await rotationSlider.fill('45');
  await expect(page.getByLabel('Rotation in degrees')).toHaveValue('45');

  // Test combining another sprite from extracted library into frame 1
  await page.getByRole('button', { name: 'Combine another sprite' }).click();
  await expect(page.getByRole('region', { name: 'Sprite Library' })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/drawer-open.png' });
  await page
    .getByRole('button', { name: /Combine in Frame 1/ })
    .first()
    .click();

  // Verify frame 1 now has 2 layers
  await expect(page.getByText(/Layers in Frame 1 \(2\)/)).toBeVisible();
  await expect(page.locator('.sidebar-layer-card').first()).toContainText('Front');
  await expect(page.locator('.sidebar-layer-card').last()).toContainText('Back');
  expect(
    await page
      .locator('.stage-layer-element')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-layer-index')),
      ),
  ).toEqual(['1', '0']);

  // Test multi-selection of layers
  await page.getByRole('button', { name: 'Select all' }).click();
  await expect(page.getByText(/2 layers selected/).first()).toBeVisible();

  // Perform collective transform on both selected layers
  await page.getByRole('button', { name: 'Flip V', exact: true }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();

  // Test Redo button
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

  // Test Ctrl+Z shortcut
  await page.keyboard.press('Control+z');

  // Verify composite export runs cleanly
  const sheet = await download(page, 'Download spritesheet PNG');
  expect(sheet.length).toBeGreaterThan(0);
  const metadata = JSON.parse((await download(page, 'Download frame data (JSON)')).toString());
  expect(metadata.frames[0].layersCount).toBe(2);

  await page
    .locator('.animation-workspace-view')
    .screenshot({ path: 'screenshots/animation-multi-layer.png' });

  // Test return to extractor workspace
  await page.getByRole('button', { name: 'Close animation studio' }).click();
  await expect(page.getByRole('button', { name: 'Create animation' })).toBeVisible();

  expect(errors).toEqual([]);
});
