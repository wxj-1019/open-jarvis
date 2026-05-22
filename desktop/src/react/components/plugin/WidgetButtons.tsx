/**
 * WidgetButtons — titlebar icons for plugin widgets.
 *
 * All widgets are visible by default. Right-click to hide; hidden widgets
 * go into a dropdown menu where they can be shown again.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { DotsThree, Eye, BookOpen } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { useStore } from '../../stores';
import { resolvePluginTitle, resolvePluginIcon } from '../../utils/resolve-plugin-title';
import { openWidget, openDesk, hideWidget, showWidget } from '../../stores/plugin-ui-actions';
import { ContextMenu, type ContextMenuItem } from '../../ui';
import s from './WidgetButtons.module.css';

interface MenuState { items: ContextMenuItem[]; position: { x: number; y: number } }

export function WidgetButtons() {
  const widgets = useStore(st => st.pluginWidgets);
  const hiddenWidgets = useStore(st => st.hiddenWidgets);
  const jianView = useStore(st => st.jianView);
  const currentTab = useStore(st => st.currentTab);
  const locale = useStore(st => st.locale);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [dropdownOpen]);

  const handleContextVisible = useCallback((e: React.MouseEvent, pluginId: string, title: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      position: { x: e.clientX, y: e.clientY },
      items: [{ label: `隐藏「${title}」`, action: () => hideWidget(pluginId) }],
    });
  }, []);

  if (currentTab !== 'chat' || widgets.length === 0) return null;

  const visibleWidgets = widgets.filter(w => !hiddenWidgets.includes(w.pluginId));
  const hiddenWidgetList = widgets.filter(w => hiddenWidgets.includes(w.pluginId));

  return (
    <div className={s.container}>
      {/* Visible widgets: individual buttons, right-click to hide */}
      {visibleWidgets.map(w => {
        const icon = resolvePluginIcon(w.icon, w.title, locale);
        const title = resolvePluginTitle(w.title, locale, w.pluginId);
        const active = jianView === `widget:${w.pluginId}`;
        return (
          <button
            key={w.pluginId}
            className={`${s.btn}${active ? ` ${s.active}` : ''}`}
            title={title}
            onClick={() => active ? openDesk() : openWidget(w.pluginId)}
            onContextMenu={(e) => handleContextVisible(e, w.pluginId, title)}
            dangerouslySetInnerHTML={icon.type === 'svg' ? { __html: icon.content } : undefined}
          >
            {icon.type === 'text' ? icon.content : null}
          </button>
        );
      })}

      {/* Dropdown for hidden widgets — show button to restore */}
      {hiddenWidgetList.length > 0 && (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button className={s.btn} title="已隐藏的插件" onClick={() => setDropdownOpen(!dropdownOpen)}>
            <PhosphorIcon icon={DotsThree} size={14} />
          </button>
          {dropdownOpen && (
            <div className={s.dropdown}>
              {hiddenWidgetList.map(w => {
                const title = resolvePluginTitle(w.title, locale, w.pluginId);
                return (
                  <div key={w.pluginId} className={s.dropdownRow}>
                    <button className={s.dropdownItem}
                      onClick={() => { showWidget(w.pluginId); setDropdownOpen(false); }}>
                      {title}
                    </button>
                    <button
                      className={s.pinBtn}
                      title="显示"
                      onClick={(e) => { e.stopPropagation(); showWidget(w.pluginId); setDropdownOpen(false); }}
                    >
                      <PhosphorIcon icon={Eye} size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Desk toggle */}
      <button
        className={`${s.btn}${jianView === 'desk' ? ` ${s.active}` : ''}`}
        title="工作台"
        onClick={() => openDesk()}
      >
        <PhosphorIcon icon={BookOpen} size={14} />
      </button>

      <div className={s.divider} />

      {menu && <ContextMenu items={menu.items} position={menu.position} onClose={() => setMenu(null)} />}
    </div>
  );
}
