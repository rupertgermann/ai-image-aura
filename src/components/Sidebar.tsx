import React, { useState } from 'react';
import { LayoutGrid, PlusSquare, Image as ImageIcon, Settings, Sparkles, HardDrive, ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { AppView } from '../app/types';

interface SidebarProps {
    currentView: AppView;
    onViewChange: (view: AppView) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
    const [isCollapsed, setIsCollapsed] = useLocalStorage('sidebar_collapsed', false);
    const [theme, setTheme] = useState<'light' | 'dark'>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    const nextTheme = theme === 'dark' ? 'light' : 'dark';

    const toggleTheme = () => {
        document.documentElement.dataset.theme = nextTheme;
        document.documentElement.style.colorScheme = nextTheme;
        setTheme(nextTheme);
        try { localStorage.setItem('aura_theme', nextTheme); } catch { /* Storage may be unavailable in private browsing. */ }
    };

    const navItems: { id: AppView; label: string; icon: React.ReactNode }[] = [
        { id: 'generate', label: 'Generate', icon: <PlusSquare size={20} /> },
        { id: 'archive', label: 'Archive', icon: <ImageIcon size={20} /> },
        { id: 'editor', label: 'Editor', icon: <LayoutGrid size={20} /> },
        { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
    ];

    return (
        <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
            <button
                className="sidebar-collapse-btn"
                aria-expanded={!isCollapsed}
                onClick={() => setIsCollapsed(!isCollapsed)}
                title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
                {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>

            <div className="sidebar-logo">
                <Sparkles className="logo-icon" size={28} />
                <span>AURA AI</span>
            </div>

            <nav className="sidebar-nav" aria-label="Main navigation">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        aria-label={item.label}
                        title={isCollapsed ? item.label : undefined}
                        aria-current={currentView === item.id ? 'page' : undefined}
                        className={`nav-item ${currentView === item.id ? 'active' : ''}`}
                        onClick={() => onViewChange(item.id)}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>

            <button className="nav-item theme-toggle" aria-label={`Switch to ${nextTheme} mode`} title={`Switch to ${nextTheme} mode`} onClick={toggleTheme}>
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>

            <div className="sidebar-footer">
                <div className="status-indicator">
                    <HardDrive size={14} aria-hidden="true" />
                    <span>Local workspace</span>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
