import React, { useState } from 'react';
import { LayoutGrid, PlusSquare, Image as ImageIcon, Settings, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AppView } from '../types';

interface SidebarProps {
    currentView: AppView;
    onViewChange: (view: AppView) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const navItems: { id: AppView; label: string; icon: React.ReactNode }[] = [
        { id: 'generate', label: 'Generate', icon: <PlusSquare size={20} /> },
        { id: 'archive', label: 'Archive', icon: <ImageIcon size={20} /> },
        { id: 'editor', label: 'Editor', icon: <LayoutGrid size={20} /> },
        { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
    ];

    return (
        <aside className={`sidebar glass-panel ${isCollapsed ? 'collapsed' : ''}`}>
            <button
                className="sidebar-collapse-btn"
                onClick={() => setIsCollapsed(!isCollapsed)}
                title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
                {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>

            <div className="sidebar-logo">
                <Sparkles className="logo-icon" size={28} />
                {!isCollapsed && <span className="gradient-text">AURA AI</span>}
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
                    {!isCollapsed && <span>API Connected</span>}
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
