import React from 'react';
import { LayoutGrid, PlusSquare, Image as ImageIcon, Settings, Sparkles } from 'lucide-react';
import type { AppView } from '../types';

interface SidebarProps {
    currentView: AppView;
    onViewChange: (view: AppView) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
    const navItems: { id: AppView; label: string; icon: React.ReactNode }[] = [
        { id: 'generate', label: 'Generate', icon: <PlusSquare size={20} /> },
        { id: 'archive', label: 'Archive', icon: <ImageIcon size={20} /> },
        { id: 'editor', label: 'Editor', icon: <LayoutGrid size={20} /> },
        { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
    ];

    return (
        <aside className="sidebar glass-panel">
            <div className="sidebar-logo">
                <Sparkles className="logo-icon" size={28} />
                <span className="gradient-text">AURA AI</span>
            </div>

            <nav className="sidebar-nav">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        className={`nav-item ${currentView === item.id ? 'active' : ''}`}
                        onClick={() => onViewChange(item.id)}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="status-indicator">
                    <div className="status-dot"></div>
                    <span>API Connected</span>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
