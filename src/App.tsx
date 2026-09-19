import { lazy, Suspense, useRef, useState } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { Crop, Film, LockKeyhole, Scissors, Sparkles } from 'lucide-react';
import type { ImageItem, Services } from './application/use-splitter';
import { ExtractorWorkspace } from './components/ExtractorWorkspace';
import { VersionBadge } from './components/VersionBadge';
import type { WorkshopSeed } from './sprite-workshop/application/use-sprite-workshop-frames';

const BackgroundEditor = lazy(() => import('./background/components/BackgroundEditor'));
const SpriteWorkshopWorkspace = lazy(
  () => import('./sprite-workshop/components/SpriteWorkshopWorkspace'),
);

type WorkspaceTab = 'extract' | 'workshop' | 'background';

export default function App({ services }: { services: Services }) {
  const [editorOpened, setEditorOpened] = useState(false);
  const [selectedTab, setSelectedTab] = useState<WorkspaceTab>('extract');
  const [workshopSeed, setWorkshopSeed] = useState<WorkshopSeed | null>(null);
  const workshopSeedId = useRef(0);

  function openWorkshop(initialFrames: ImageItem[], availableSprites: ImageItem[]) {
    workshopSeedId.current += 1;
    setWorkshopSeed({
      key: workshopSeedId.current,
      frames: initialFrames,
      availableSprites,
    });
    setSelectedTab('workshop');
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="/" className="brand" aria-label="Splitter, home">
          <span className="brand-mark">
            <Crop size={23} strokeWidth={1.8} />
          </span>
          <span>
            Splitter<span className="brand-dot">.</span>
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
        <a
          className="support-button"
          href="https://buymeacoffee.com/michelleeex"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Support this project on Buy Me a Coffee (opens in a new tab)"
        >
          <img src="/buy-me-a-coffee.png" alt="Buy me a coffee" />
        </a>
      </header>
      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={(key) => {
          setSelectedTab(key as WorkspaceTab);
          if (key === 'background') setEditorOpened(true);
        }}
      >
        <TabList className="workspace-tabs" aria-label="Image tools">
          <Tab id="extract">
            <Scissors size={16} /> Extract Elements
          </Tab>
          <Tab id="workshop">
            <Film size={16} /> Sprite Workshop <span>NEW</span>
          </Tab>
          <Tab id="background">
            <Sparkles size={16} /> Remove Background <span>NEW</span>
          </Tab>
        </TabList>
        <TabPanel id="extract" shouldForceMount>
          <ExtractorWorkspace services={services} onOpenWorkshop={openWorkshop} />
        </TabPanel>
        <TabPanel id="workshop" shouldForceMount>
          <Suspense fallback={<main role="status">Opening Sprite Workshop…</main>}>
            <SpriteWorkshopWorkspace
              key={workshopSeed ? `seed-${workshopSeed.key}` : 'standalone'}
              services={services}
              seed={workshopSeed}
              onExitToExtractor={() => setSelectedTab('extract')}
            />
          </Suspense>
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
