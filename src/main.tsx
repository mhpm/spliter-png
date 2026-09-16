import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from 'react-aria-components';
import App from './App';
import { workerExtractor } from './infrastructure/worker-extractor';
import { zipWriter } from './infrastructure/zip';
import { inspectPng } from './infrastructure/png';
import { downloadBlob } from './infrastructure/download';
import './styles.css';

const services = {
  extractor: workerExtractor,
  archive: zipWriter,
  inspect: inspectPng,
  download: downloadBlob,
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider locale="es-MX">
      <App services={services} />
    </I18nProvider>
  </StrictMode>,
);
