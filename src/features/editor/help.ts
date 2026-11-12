import { useState } from 'react';

export type HelpTab = 'start' | 'trouble' | 'keys' | 'outlines' | 'legal';

export const REPO_URL = 'https://github.com/HanazonoArchive/switchtheme_studio';
export const ISSUES_URL = `${REPO_URL}/issues`;
export const INJECTOR_URL = 'https://github.com/exelix11/SwitchThemeInjector';

/** Which Help page is open (null: closed). */
export const useHelp = () => {
  const [tab, setTab] = useState<HelpTab | null>(null);
  return { tab, open: setTab, close: () => setTab(null) };
};
