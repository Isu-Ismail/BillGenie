import React, { useState, useEffect } from 'react';
import { 
  Tag,
  Shield,
  MapPin,
  Users,
  RefreshCcw,
  LogOut
} from 'lucide-react';

import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import ConfirmModal from '../../components/ConfirmModal';
import styles from './Settings.module.css';

// Import Tab Components
import CategoriesTab from './tabs/Categories/CategoriesTab';
import TrustsTab from './tabs/Trusts/TrustsTab';
import StreetsTab from './tabs/Streets/StreetsTab';
import DonorsTab from './tabs/Donors/DonorsTab';

const Settings = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('categories'); // 'categories', 'trusts', 'streets', 'donors'
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Shared Confirm Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'danger',
    confirmText: 'Confirm'
  });

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    navigate('/login');
  };

  const handleReload = async () => {
    setIsRefreshing(true);
    // Invalidate the specific query key for the active tab
    await queryClient.invalidateQueries({ queryKey: [activeTab] });
    // Small timeout to show the spinning animation
    setTimeout(() => setIsRefreshing(false), 800);
  };

  // Refetch when tab changes to ensure latest data
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: [activeTab] });
  }, [activeTab, queryClient]);

  const showConfirm = (config) => {
    setConfirmModal({
      ...confirmModal,
      ...config,
      isOpen: true
    });
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'categories':
        return <CategoriesTab onConfirmDelete={showConfirm} />;
      case 'trusts':
        return <TrustsTab onConfirmDelete={showConfirm} />;
      case 'streets':
        return <StreetsTab onConfirmDelete={showConfirm} />;
      case 'donors':
        return <DonorsTab onConfirmDelete={showConfirm} />;
      default:
        return <CategoriesTab onConfirmDelete={showConfirm} />;
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Settings</h1>
          <p className={styles.subtitle}>System configuration and management</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.reloadBtn} onClick={handleReload} disabled={isRefreshing}>
            <RefreshCcw size={18} className={isRefreshing ? styles.spin : ''} />
            Reload Data
          </button>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            <LogOut size={18} /> Logout
          </button>
        </div>
      </header>

      <div className={styles.tabsContainer}>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'categories' ? styles.active : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          <Tag size={18} /> Categories
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'trusts' ? styles.active : ''}`}
          onClick={() => setActiveTab('trusts')}
        >
          <Shield size={18} /> Organizations
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'streets' ? styles.active : ''}`}
          onClick={() => setActiveTab('streets')}
        >
          <MapPin size={18} /> Streets
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'donors' ? styles.active : ''}`}
          onClick={() => setActiveTab('donors')}
        >
          <Users size={18} /> Donors
        </button>
      </div>

      <div className={styles.contentWrapper}>
        <main className={styles.mainContent}>
          {renderTabContent()}
        </main>
      </div>

      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        type={confirmModal.type}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={() => {
          confirmModal.onConfirm();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
      />
    </div>
  );
};

export default Settings;
