import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

test('upload, extract, inspect, rename and download six intact PNGs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await page.screenshot({ path: 'test-results/desktop-empty.png', fullPage: true });
  await expect(page.getByRole('button', { name: 'Descargar ZIP' })).toBeDisabled();
  await page.getByLabel('Archivo PNG').setInputFiles('tests/fixtures/sample.png');
  await page.getByRole('button', { name: 'Extraer elementos', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del elemento' })).toHaveCount(6);
  await page.screenshot({ path: 'test-results/desktop-results.png', fullPage: true });
  await page.getByRole('button', { name: 'Ampliar elemento 1', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar vista previa' }).click();
  await page
    .getByRole('textbox', { name: 'Nombre del elemento 1', exact: true })
    .fill('pieza verde');
  await page
    .getByRole('textbox', { name: 'Nombre del elemento 2', exact: true })
    .fill('pieza verde');
  await expect(page.getByRole('button', { name: /Descargar ZIP/ })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Nombre del elemento 2', exact: true }).fill('círculo');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /Descargar ZIP/ }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('sample_elementos.zip');
  const files = unzipSync(await readFile((await download.path())!));
  expect(Object.keys(files)).toHaveLength(6);
  expect(files['pieza verde.png']).toBeDefined();
  expect(files['círculo.png']).toBeDefined();
  for (const bytes of Object.values(files))
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await expect(page.getByText('Tu ZIP está listo. Revisa tus descargas.')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('empty results, opaque warning, re-extraction and file validation', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Archivo PNG').setInputFiles('tests/fixtures/transparent.png');
  await page.getByRole('button', { name: 'Extraer elementos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No encontramos elementos' })).toBeVisible();
  await page.getByLabel('Archivo PNG').setInputFiles('tests/fixtures/opaque.png');
  await page.getByRole('button', { name: 'Extraer elementos', exact: true }).click();
  await expect(page.getByText(/Este PNG no tiene transparencia/)).toBeVisible();
  await page.getByText('Más ajustes', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Margen', exact: true }).fill('8');
  await page.getByRole('textbox', { name: 'Margen', exact: true }).press('Tab');
  await expect(page.getByText(/Hay ajustes pendientes/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Descargar ZIP/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Volver a extraer', exact: true }).click();
  await expect(page.getByRole('button', { name: /Descargar ZIP/ })).toBeEnabled();
  await page
    .getByLabel('Archivo PNG')
    .setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert')).toContainText('PNG válido');
});

test('mobile workflow stays within viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Archivo PNG').setInputFiles('tests/fixtures/sample.png');
  await page.getByRole('button', { name: 'Extraer elementos', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del elemento' })).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.getByRole('button', { name: /Descargar ZIP/ })).toBeEnabled();
  await page.screenshot({ path: 'test-results/mobile-results.png', fullPage: true });
});

test('16 megapixel input can be cancelled, retried and replaced without stale results', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Archivo PNG').setInputFiles('tests/fixtures/large.png');
  await page.getByRole('button', { name: 'Extraer elementos', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Extraer elementos', exact: true })).toBeEnabled();
  const started = Date.now();
  await page.getByRole('button', { name: 'Extraer elementos', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del elemento' })).toHaveCount(4, {
    timeout: 15000,
  });
  console.log(`16 MP extraction: ${Date.now() - started} ms`);
  await page.getByLabel('Archivo PNG').setInputFiles('tests/fixtures/sample.png');
  await page.getByRole('button', { name: 'Extraer elementos', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del elemento' })).toHaveCount(6);
  await expect(
    page.getByRole('textbox', { name: 'Nombre del elemento 1', exact: true }),
  ).toHaveValue('sample_001');
});

test('user can select and deselect elements to download only chosen pieces', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Archivo PNG').setInputFiles('tests/fixtures/sample.png');
  await page.getByRole('button', { name: 'Extraer elementos', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del elemento' })).toHaveCount(6);

  // All 6 items start selected
  await expect(page.getByText('6 de 6 seleccionados')).toBeVisible();
  await expect(page.getByRole('button', { name: /Descargar ZIP/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Descargar ZIP/ })).toContainText('6');

  // Deselect all
  await page.getByRole('button', { name: 'Deseleccionar todos' }).click();
  await expect(page.getByText('0 de 6 seleccionados')).toBeVisible();
  await expect(page.getByRole('button', { name: /Descargar ZIP/ })).toBeDisabled();
  await expect(page.getByText('Selecciona al menos un elemento para descargar.')).toBeVisible();

  // Select only item 1 and item 3
  await page.getByRole('button', { name: 'Seleccionar elemento 1' }).click();
  await page.getByRole('button', { name: 'Seleccionar elemento 3' }).click();
  await expect(page.getByText('2 de 6 seleccionados')).toBeVisible();
  await expect(page.getByRole('button', { name: /Descargar ZIP/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Descargar ZIP/ })).toContainText('2');

  // Download ZIP and verify only the 2 selected items are present
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /Descargar ZIP/ }).click();
  const download = await downloadEvent;
  const files = unzipSync(await readFile((await download.path())!));
  expect(Object.keys(files)).toHaveLength(2);
  expect(files['sample_001.png']).toBeDefined();
  expect(files['sample_003.png']).toBeDefined();
  expect(files['sample_002.png']).toBeUndefined();

  // Test individual PNG quick download button on element 2
  const singleDownloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PNG del elemento 2' }).click();
  const singleDownload = await singleDownloadEvent;
  expect(singleDownload.suggestedFilename()).toBe('sample_002.png');
});
