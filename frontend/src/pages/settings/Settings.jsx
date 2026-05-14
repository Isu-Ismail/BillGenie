import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Plus, 
  Trash2, 
  Save,
  Tag,
  Users,
  Shield,
  Bell,
  Loader2,
  MapPin,
  Phone,
  AlertCircle,
  Edit,
  X,
  Mail,
  Building2,
  PieChart
} from 'lucide-react';

import { useNavigate } from 'react-router-dom';
import ConfirmModal from '../../components/ConfirmModal';
import styles from './Settings.module.css';

import { API_ENDPOINTS } from '../../api';

const Settings = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [trusts, setTrusts] = useState([]);
  const [activeTab, setActiveTab] = useState('categories'); // 'categories' or 'trusts'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [editModal, setEditModal] = useState({ isOpen: false, type: '', mode: 'edit', data: null }); // type: 'category' | 'trust', mode: 'edit' | 'create'

  // Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'danger',
    confirmText: 'Confirm'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchCategories(), fetchTrusts()]);
    } catch (err) {
      setError("Server connection error. Please ensure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.CATEGORIES.BASE);
      if (response.ok) {
        setCategories(await response.json());
      }
    } catch (error) { console.error(error); }
  };

  const fetchTrusts = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.TRUSTS.BASE);
      if (response.ok) {
        setTrusts(await response.json());
      }
    } catch (error) { console.error(error); }
  };

  const handleSaveCategory = async () => {
    if (!editModal.data || !editModal.data.name.trim()) return;
    const isEdit = editModal.mode === 'edit';
    const url = isEdit 
      ? API_ENDPOINTS.CATEGORIES.DETAIL(editModal.data.id)
      : API_ENDPOINTS.CATEGORIES.CREATE;
    
    try {
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? editModal.data : { name: editModal.data.name })
      });
      if (response.ok) {
        await fetchCategories();
        setEditModal({ isOpen: false, type: '', mode: 'edit', data: null });
      }
    } catch (err) { console.error(err); }
  };

  const handleSaveTrust = async () => {
    if (!editModal.data || !editModal.data.name.trim()) return;
    const isEdit = editModal.mode === 'edit';
    const url = isEdit 
      ? API_ENDPOINTS.TRUSTS.DETAIL(editModal.data.id)
      : API_ENDPOINTS.TRUSTS.CREATE;
    
    try {
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editModal.data)
      });
      if (response.ok) {
        await fetchTrusts();
        setEditModal({ isOpen: false, type: '', mode: 'edit', data: null });
      }
    } catch (err) { console.error(err); }
  };

  const deleteCategory = async (id) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Category",
      message: "Are you sure you want to delete this category? This cannot be undone.",
      confirmText: "Delete",
      type: "danger",
      onConfirm: async () => {
        try {
          const res = await fetch(API_ENDPOINTS.CATEGORIES.DETAIL(id), { method: 'DELETE' });
          if (res.ok) {
            setCategories(categories.filter(c => c.id !== id));
          } else {
            const errData = await res.json();
            alert(errData.detail || "Could not delete category.");
          }
        } catch (err) { console.error(err); }
      }
    });
  };

  const deleteTrust = async (id) => {
    setConfirmModal({
      isOpen: true,
      title: "Remove Trust",
      message: "Are you sure you want to remove this trust profile?",
      confirmText: "Remove",
      type: "danger",
      onConfirm: async () => {
        try {
          const res = await fetch(API_ENDPOINTS.TRUSTS.DETAIL(id), { method: 'DELETE' });
          if (res.ok) {
            setTrusts(trusts.filter(t => t.id !== id));
          }
        } catch (err) { console.error(err); }
      }
    });
  };


  const toggleCategory = (catId) => {
    const current = editModal.data.category_ids || [];
    const updated = current.includes(catId)
      ? current.filter(id => id !== catId)
      : [...current, catId];
    setEditModal({ ...editModal, data: { ...editModal.data, category_ids: updated } });
  };

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    navigate('/login');
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Settings</h1>
          <p className={styles.subtitle}>System configuration and management</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Logout Account
          </button>
        </div>
      </header>

      <div className={styles.tabsContainer}>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'categories' ? styles.active : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          <Tag size={18} /> Donation Categories
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'trusts' ? styles.active : ''}`}
          onClick={() => setActiveTab('trusts')}
        >
          <Shield size={18} /> Organization Trusts
        </button>
      </div>

      <div className={styles.contentWrapper}>
        <main className={styles.mainContent}>
          {error && (
            <div className={styles.error}>
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'categories' ? (
            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div className={styles.titleGroup}>
                  <div className={styles.iconBox}><PieChart size={24} /></div>
                  <div>
                    <h2>Expense Categories</h2>
                    <p>Manage donation classification tags</p>
                  </div>
                </div>
                <button 
                  className={styles.addPrimaryBtn}
                  onClick={() => setEditModal({ isOpen: true, type: 'category', mode: 'create', data: { name: '' } })}
                >
                  <Plus size={18} /> Add New Category
                </button>
              </div>

              <div className={styles.categoryGrid}>
                {loading ? (
                  <div className={styles.loader}><Loader2 size={24} className={styles.spin} /></div>
                ) : categories.length === 0 ? (
                  <div className={styles.empty}>No categories found.</div>
                ) : (
                  categories.map(category => (
                    <div key={category.id} className={styles.categoryCard}>
                      <span className={styles.catName}>{category.name}</span>
                      <div className={styles.catActions}>
                        <button onClick={() => setEditModal({ isOpen: true, type: 'category', mode: 'edit', data: { ...category } })} className={styles.editBtn}>
                          <Edit size={14} />
                        </button>
                        <button onClick={() => deleteCategory(category.id)} className={styles.deleteBtn}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : (
            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div className={styles.titleGroup}>
                  <div className={styles.iconBox}><Building2 size={24} /></div>
                  <div>
                    <h2>Trust Organizations</h2>
                    <p>Manage multi-trust profile details</p>
                  </div>
                </div>
                <button 
                  className={styles.addPrimaryBtn}
                  onClick={() => setEditModal({ isOpen: true, type: 'trust', mode: 'create', data: { name: '', address: '', mobile: '', email: '' } })}
                >
                  <Plus size={18} /> Register New Trust
                </button>
              </div>

              <div className={styles.trustGrid}>
                {loading ? (
                  <div className={styles.loader}><Loader2 size={24} className={styles.spin} /></div>
                ) : trusts.length === 0 ? (
                  <div className={styles.empty}>No organizations registered.</div>
                ) : (
                  trusts.map(trust => (
                    <div key={trust.id} className={styles.trustCard}>
                      <div className={styles.trustInfo}>
                        <h3>{trust.name}</h3>
                        <p><MapPin size={14} /> {trust.address || 'No address provided'}</p>
                        <div className={styles.trustMeta}>
                          <span><Phone size={14} /> {trust.mobile || 'N/A'}</span>
                          <span><Mail size={14} /> {trust.email || 'N/A'}</span>
                        </div>
                      </div>
                      <div className={styles.trustActions}>
                        <button onClick={() => setEditModal({ isOpen: true, type: 'trust', mode: 'edit', data: { ...trust } })} className={styles.editBtn}>
                          <Edit size={16} /> Edit Profile
                        </button>
                        <button onClick={() => deleteTrust(trust.id)} className={styles.deleteBtn}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Edit Modal */}
      {editModal.isOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{editModal.mode === 'create' ? 'Add New' : 'Edit'} {editModal.type === 'category' ? 'Category' : 'Trust'}</h2>
              <button onClick={() => setEditModal({ isOpen: false, type: '', mode: 'edit', data: null })} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {editModal.type === 'category' ? (
                <div className={styles.modalForm}>
                  <div className={styles.inputGroup}>
                    <label>Category Name</label>
                    <input 
                      type="text"
                      value={editModal.data.name}
                      onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, name: e.target.value } })}
                      placeholder="e.g. Mosque Fund"
                      autoFocus
                    />
                  </div>
                </div>
              ) : (
                <div className={styles.modalForm}>
                  <div className={styles.inputGroup}>
                    <label>Trust Name</label>
                    <input 
                      type="text"
                      value={editModal.data.name}
                      onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, name: e.target.value } })}
                      placeholder="Organization Name"
                      autoFocus
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label>Address</label>
                    <input 
                      type="text"
                      value={editModal.data.address}
                      onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, address: e.target.value } })}
                      placeholder="Full Address"
                    />
                  </div>
                  <div className={styles.modalGrid}>
                    <div className={styles.inputGroup}>
                      <label>Mobile</label>
                      <input 
                        type="text"
                        value={editModal.data.mobile}
                        onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, mobile: e.target.value } })}
                        placeholder="Contact Number"
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Email</label>
                      <input 
                        type="email"
                        value={editModal.data.email}
                        onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, email: e.target.value } })}
                        placeholder="Contact Email"
                      />
                    </div>
                  </div>
                  
                  <div className={styles.categorySelectSection}>
                    <label className={styles.sectionLabel}>Trust Categories (Binding)</label>
                    <div className={styles.checkboxGrid}>
                      {categories.map(cat => (
                        <label key={cat.id} className={styles.checkboxLabel}>
                          <input 
                            type="checkbox"
                            checked={(editModal.data.category_ids || []).includes(cat.id)}
                            onChange={() => toggleCategory(cat.id)}
                          />
                          <span className={styles.checkboxText}>{cat.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button 
                className={styles.cancelBtn} 
                onClick={() => setEditModal({ isOpen: false, type: '', mode: 'edit', data: null })}
              >
                Cancel
              </button>
              <button 
                className={styles.saveBtn} 
                onClick={editModal.type === 'category' ? handleSaveCategory : handleSaveTrust}
              >
                {editModal.mode === 'create' ? 'Create' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        type={confirmModal.type}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={confirmModal.onConfirm}
      />
    </div>
  );
};

export default Settings;
