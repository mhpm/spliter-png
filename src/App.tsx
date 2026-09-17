import { lazy, Suspense, useState } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { Crop, LockKeyhole, Scissors, Sparkles } from 'lucide-react';
import type { Services } from './application/use-splitter';
import { ExtractorWorkspace } from './components/ExtractorWorkspace';
import { VersionBadge } from './components/VersionBadge';

const BackgroundEditor = lazy(() => import('./background/components/BackgroundEditor'));

export default function App({ services }: { services: Services }) {
  const [editorOpened, setEditorOpened] = useState(false);
  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="/" className="brand" aria-label="Spliter, home">
          <span className="brand-mark">
            <Crop size={23} strokeWidth={1.8} />
          </span>
          <span>
            spliter<span className="brand-dot">.</span>
          </span>
        </a>
        <VersionBadge />
        <div className="header-divider" />
        <span className="header-description">Your images, ready to create</span>
        <span className="local-badge">
          <span className="local-badge-dot" aria-hidden="true" />
          <LockKeyhole size={13} />
          <span>100% in your browser</span>
        </span>
      </header>
      <Tabs
        defaultSelectedKey="extract"
        onSelectionChange={(key) => {
          if (key === 'background') setEditorOpened(true);
        }}
      >
        <TabList className="workspace-tabs" aria-label="Image tools">
          <Tab id="extract">
            <Scissors size={16} /> Extract Elements
          </Tab>
          <Tab id="background">
            <Sparkles size={16} /> Remove Background <span>NEW</span>
          </Tab>
        </TabList>
        <TabPanel id="extract" shouldForceMount>
          <ExtractorWorkspace services={services} />
        </TabPanel>
        <TabPanel id="background" shouldForceMount>
          {editorOpened && (
            <Suspense fallback={<main role="status">Opening the editor…</main>}>
              <BackgroundEditor />
            </Suspense>
          )}
        </TabPanel>
      </Tabs>
    </div>
  );
}
