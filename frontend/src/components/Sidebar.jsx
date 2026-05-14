import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  PlusCircle, 
  History, 
  BarChart3, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Receipt
} from 'lucide-react';
import styles from './Sidebar.module.css';

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: PlusCircle, label: 'New Entry', path: '/entry' },
    { icon: History, label: 'History', path: '/history' },
    { icon: BarChart3, label: 'Reports', path: '/report' },
  ];

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <Receipt size={24} />
          </div>
          {!isCollapsed && <span className={styles.logoText}>BillGenie</span>}
        </div>
        <button className={styles.toggleBtn} onClick={toggleSidebar}>
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className={styles.nav}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => 
              `${styles.navLink} ${isActive ? styles.active : ''}`
            }
          >
            <item.icon size={20} className={styles.icon} />
            {!isCollapsed && <span className={styles.label}>{item.label}</span>}
            {isCollapsed && <div className={styles.tooltip}>{item.label}</div>}
          </NavLink>
        ))}
      </nav>

      <div className={styles.footer}>
        <NavLink 
          to="/settings" 
          className={({ isActive }) => 
            `${styles.navLink} ${isActive ? styles.active : ''}`
          }
        >
          <Settings size={20} className={styles.icon} />
          {!isCollapsed && <span className={styles.label}>Settings</span>}
        </NavLink>
      </div>
    </aside>
  );
};

export default Sidebar;