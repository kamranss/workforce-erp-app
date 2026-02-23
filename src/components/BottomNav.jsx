import { useRef } from 'react';
import { FiClock, FiCreditCard, FiDollarSign, FiFolder, FiHome, FiPlayCircle, FiUser } from 'react-icons/fi';
import { useUI } from '../context/UIProvider.jsx';

const TABS = [
  { key: 'home', label: 'Home', icon: FiHome },
  { key: 'clock', label: 'Clock', icon: FiPlayCircle },
  { key: 'projects', label: 'Projects', icon: FiFolder },
  { key: 'finance', label: 'Finance', icon: FiDollarSign },
  { key: 'hours', label: 'Hours', icon: FiClock },
  { key: 'payments', label: 'Payments', icon: FiCreditCard },
  { key: 'profile', label: 'Profile', icon: FiUser }
];

export default function BottomNav() {
  const { activeTab, setActiveTab, allowedTabs, triggerTabAction } = useUI();
  const tapStateRef = useRef({ tab: '', at: 0, count: 0 });
  const DOUBLE_TAP_MS = 900;

  const handleClick = (tabKey) => {
    if (activeTab !== tabKey) {
      tapStateRef.current = { tab: tabKey, at: Date.now(), count: 0 };
      setActiveTab(tabKey);
      return;
    }

    const now = Date.now();
    const prev = tapStateRef.current;
    const isSameTab = prev.tab === tabKey;
    const withinWindow = (now - prev.at) <= DOUBLE_TAP_MS;
    const nextCount = isSameTab && withinWindow ? prev.count + 1 : 1;

    tapStateRef.current = { tab: tabKey, at: now, count: nextCount };
    if (nextCount >= 2) {
      tapStateRef.current = { tab: '', at: 0, count: 0 };
      triggerTabAction(tabKey);
    }
  };

  return (
    <nav className="nav" id="mainNav">
      <div className="dock">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          const isAllowed = allowedTabs.includes(tab.key);
          if (!isAllowed) return null;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              id={`nav-${tab.key}`}
              className={`item${isActive ? ' active' : ''}`}
              type="button"
              aria-pressed={isActive}
              disabled={!isAllowed}
              onClick={() => handleClick(tab.key)}
            >
              <span className="icon"><Icon aria-hidden="true" /></span>
              <span className="label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
