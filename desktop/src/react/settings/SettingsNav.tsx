import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore, type PluginSettingsTab } from './store';
import { getNativeSettingsTabComponent } from './native-settings-tabs';
import { t } from './helpers';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import {
  User,
  UserCircle,
  Gear,
  Briefcase,
  Desktop,
  Wrench,
  Link,
  ChartLine as Activity,
  Image,
  UploadSimple,
  Keyboard,
  PuzzlePiece,
  ShieldCheck,
  Info,
  List,
  Database,
  MicrophoneStage,
  Plugs,
} from '@phosphor-icons/react';
import styles from './Settings.module.css';

const TAB_ITEMS = [
  { id: 'agent', key: 'settings.tabs.agent', icon: User },
  { id: 'me', key: 'settings.tabs.me', icon: UserCircle },
  { id: 'interface', key: 'settings.tabs.interface', icon: Gear },
  { id: 'work', key: 'settings.tabs.work', icon: Briefcase },
  { id: 'computer', key: 'settings.tabs.computer', icon: Desktop },
  { id: 'skills', key: 'settings.tabs.skills', icon: Wrench },
  { id: 'mcp', key: 'settings.tabs.mcp', icon: Plugs },
  { id: 'bridge', key: 'settings.tabs.bridge', icon: Link },
  { id: 'providers', key: 'settings.tabs.providers', icon: Activity },
  { id: 'media', key: 'settings.tabs.media', icon: Image },
  { id: 'voice', key: 'settings.tabs.voice', icon: MicrophoneStage },
  { id: 'sharing', key: 'settings.tabs.sharing', icon: UploadSimple },
  { id: 'access', key: 'settings.tabs.access', icon: Keyboard },
  { id: 'plugins', key: 'settings.tabs.plugins', icon: PuzzlePiece },
  { id: 'security', key: 'settings.tabs.security', icon: ShieldCheck },
  { id: 'about', key: 'settings.tabs.about', icon: Info },
  { id: 'backup', key: 'settings.tabs.backup', icon: Database },
];

const FALLBACK_PLUGIN_ICON = List;

interface SettingsNavProps {
  onTabChange?: (tab: string) => void;
}

function titleToLabel(title: PluginSettingsTab['title']): string {
  if (typeof title === 'string') return title;
  const locale = window.i18n?.locale || 'zh-CN';
  return title[locale] || title[locale.split('-')[0]] || title.zh || title.en || Object.values(title)[0] || '';
}

function supportsComputerUseTab(platformName: string | null | undefined) {
  return platformName !== 'linux';
}

function nativeTabItemsForPlatform(platformName: string | null | undefined) {
  return supportsComputerUseTab(platformName)
    ? TAB_ITEMS
    : TAB_ITEMS.filter(item => item.id !== 'computer');
}

function buildNavItems(pluginSettingsTabs: PluginSettingsTab[], platformName?: string | null) {
  const tabItems = nativeTabItemsForPlatform(platformName);
  const nativeTabs = pluginSettingsTabs
    .filter(tab => getNativeSettingsTabComponent(tab.nativeComponent))
    .map(tab => ({
      id: tab.id,
      label: titleToLabel(tab.title),
      icon: typeof tab.icon === "string" ? FALLBACK_PLUGIN_ICON : (tab.icon || FALLBACK_PLUGIN_ICON),
    }));
  if (nativeTabs.length === 0) return tabItems.map(item => ({ ...item, label: t(item.key) }));

  const items = tabItems.map(item => ({ ...item, label: t(item.key) }));
  const skillIndex = items.findIndex(item => item.id === 'skills');
  const insertAt = skillIndex === -1 ? items.length : skillIndex + 1;
  return [
    ...items.slice(0, insertAt),
    ...nativeTabs,
    ...items.slice(insertAt),
  ];
}

export function SettingsNav({ onTabChange }: SettingsNavProps) {
  const { activeTab, platformName, pluginSettingsTabs } = useSettingsStore(
    useShallow(s => ({ activeTab: s.activeTab, platformName: s.platformName, pluginSettingsTabs: s.pluginSettingsTabs }))
  );
  const set = useSettingsStore(s => s.set);
  const navItems = buildNavItems(pluginSettingsTabs || [], platformName);
  const activeNavTab = activeTab === 'plugin-marketplace' ? 'plugins' : activeTab;

  return (
    <nav className={styles['settings-nav']} data-ui-scale-wheel="ignore">
      {navItems.map(item => (
        <button
          key={item.id}
          className={`${styles['settings-nav-item']}${activeNavTab === item.id ? ' ' + styles['active'] : ''}`}
          data-tab={item.id}
          onClick={() => {
            set({ activeTab: item.id });
            onTabChange?.(item.id);
          }}
        >
          <PhosphorIcon icon={item.icon} size={14} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
