import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Building2, 
  Mail, 
  Phone, 
  MapPin, 
  Edit, 
  Trash2,
  Loader2,
  X,
  CheckCircle2,
  Search,
  ChevronDown,
  GripVertical
} from 'lucide-react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../../../../hooks/useDebounce';
import { subscribeToCollection } from '../../../../webhook';
import styles from './TrustsTab.module.css';
import { API_ENDPOINTS } from '../../../../api';

const TrustsTab = ({ onConfirmDelete }) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 2000);
  const [categories, setCategories] = useState([]);
  const [editModal, setEditModal] = useState({ isOpen: false, mode: 'edit', data: null });

  // Infinite query for paginated trusts
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status
  } = useInfiniteQuery({
    queryKey: ['trusts', debouncedSearch],
    queryFn: async ({ pageParam = 1 }) => {
      let url = `${API_ENDPOINTS.TRUSTS.BASE}?page=${pageParam}&per_page=20`;
      if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Network response was not ok');
      return response.json();
    },
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.total / lastPage.per_page);
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes cache for tab switching
  });

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToCollection('trusts', (data) => {
      queryClient.invalidateQueries({ queryKey: ['trusts'] });
    });
    return () => unsubscribe();
  }, [queryClient]);

  const updateGlobalTrustCache = (newTrust, oldTrustId = null) => {
    try {
      const saved = sessionStorage.getItem('global_cached_trusts');
      let trusts = saved ? JSON.parse(saved) : [];
      
      if (oldTrustId) {
        trusts = trusts.filter(t => t.id !== oldTrustId);
      }
      
      if (newTrust) {
        // If edit, replace old one
        trusts = trusts.filter(t => t.id !== newTrust.id);
        trusts.push(newTrust);
      }
      
      sessionStorage.setItem('global_cached_trusts', JSON.stringify(trusts));
    } catch (err) { console.error("Global cache update failed:", err); }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.CATEGORIES.BASE);
      if (response.ok) {
        const data = await response.json();
        setCategories(data.items || []);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  const handleSave = async () => {
    if (!editModal.data) return;
    
    const { name, address, mobile } = editModal.data;
    if (!name?.trim()) {
      alert("Organization Name is required.");
      return;
    }
    if (!address?.trim()) {
      alert("Address is required.");
      return;
    }
    if (!mobile?.trim()) {
      alert("Mobile number is required.");
      return;
    }

    const isEdit = editModal.mode === 'edit';
    const url = isEdit 
      ? API_ENDPOINTS.TRUSTS.DETAIL(editModal.data.id)
      : API_ENDPOINTS.TRUSTS.CREATE;
    
    const submissionData = {
      ...editModal.data,
      name: editModal.data.name.toUpperCase().trim()
    };
    
    try {
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData)
      });
      if (response.ok) {
        const savedTrust = await response.json();
        updateGlobalTrustCache(savedTrust, isEdit ? savedTrust.id : null);
        setEditModal({ isOpen: false, mode: 'edit', data: null });
        queryClient.invalidateQueries({ queryKey: ['trusts'] });

        // IMPORTANT: Update Session Cache for Entry Page
        try {
          // Fetch the fresh grouped categories for this trust
          const catRes = await fetch(`${API_ENDPOINTS.CATEGORIES.BY_TRUST(savedTrust.id)}`);
          if (catRes.ok) {
            const freshCatData = await catRes.json();
            
            // Get current cache
            const savedCache = sessionStorage.getItem('entry_trust_category_cache');
            const cache = savedCache ? JSON.parse(savedCache) : {};
            
            // Update cache for this trust
            cache[savedTrust.id] = freshCatData;
            sessionStorage.setItem('entry_trust_category_cache', JSON.stringify(cache));
          }
          
          // Clear general trusts list caches
          sessionStorage.removeItem('entry_cached_trusts');
          sessionStorage.removeItem('reports_cached_trusts_list');
          sessionStorage.removeItem('history_cached_trusts');
          sessionStorage.removeItem('dashboard_cached_trusts');
        } catch (cacheErr) {
          console.error("Cache update failed:", cacheErr);
        }
      }
    } catch (err) {
      console.error("Error saving trust:", err);
    }
  };

  const handleDelete = (id) => {
    onConfirmDelete({
      title: "Delete Organization",
      message: "Are you sure you want to delete this trust organization? This cannot be undone.",
      confirmText: "Delete",
      onConfirm: async () => {
        try {
          const res = await fetch(API_ENDPOINTS.TRUSTS.DETAIL(id), { method: 'DELETE' });
          if (res.ok) {
            updateGlobalTrustCache(null, id);
            queryClient.invalidateQueries({ queryKey: ['trusts'] });
          } else {
            const errData = await res.json();
            alert(errData.detail || "Could not delete trust.");
          }
        } catch (err) {
          console.error(err);
        }
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

  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('draggedIndex', index);
    e.target.classList.add(styles.dragging);
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove(styles.dragging);
    setDragOverIndex(null);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e, targetIndex) => {
    setDragOverIndex(null);
    const draggedIndex = parseInt(e.dataTransfer.getData('draggedIndex'));
    if (draggedIndex === targetIndex) return;

    const updated = [...(editModal.data.category_ids || [])];
    
    // Swap behavior
    [updated[draggedIndex], updated[targetIndex]] = [updated[targetIndex], updated[draggedIndex]];
    
    setEditModal({ ...editModal, data: { ...editModal.data, category_ids: updated } });
  };

  const trusts = data?.pages.flatMap(page => page.items) || [];

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (editModal.isOpen && editModal.isDropdownOpen) {
        const container = document.querySelector(`.${styles.multiSelectContainer}`);
        if (container && !container.contains(event.target)) {
          setEditModal(prev => ({ ...prev, isDropdownOpen: false }));
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editModal.isOpen, editModal.isDropdownOpen]);

  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.titleGroup}>
          <div className={styles.iconBox}><Building2 size={24} /></div>
          <div>
            <h2>Trust Organizations</h2>
            <p>Configure multiple trust bodies and assigned categories</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Search trusts..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            className={styles.addPrimaryBtn}
            onClick={() => setEditModal({ isOpen: true, mode: 'create', data: { name: '', address: '', mobile: '', email: '', category_ids: [] } })}
          >
            <Plus size={18} /> Add New
          </button>
        </div>
      </div>

      <div className={styles.trustGrid}>
        {status === 'pending' ? (
          <div className={styles.loader}><Loader2 size={24} className={styles.spin} /></div>
        ) : trusts.length === 0 ? (
          <div className={styles.empty}>No organizations found.</div>
        ) : (
          trusts.map(trust => (
            <div key={trust.id} className={styles.trustCard}>
              <div className={styles.trustInfo}>
                <h3>{trust.name}</h3>
                <p><MapPin size={14} /> {trust.address || 'No address'}</p>
                <div className={styles.trustMeta}>
                  <span><Phone size={12} /> {trust.mobile || 'N/A'}</span>
                  <span><Mail size={12} /> {trust.email || 'N/A'}</span>
                </div>
                <div className={styles.trustMeta} style={{marginTop: '8px'}}>
                   <span><CheckCircle2 size={12} /> {trust.category_ids?.length || 0} Categories Bound</span>
                </div>
              </div>
              <div className={styles.trustActions}>
                <button onClick={() => setEditModal({ isOpen: true, mode: 'edit', data: { ...trust } })} className={styles.editBtn}>
                  <Edit size={16} /> Edit
                </button>
                <button onClick={() => handleDelete(trust.id)} className={styles.deleteBtn}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}

        {hasNextPage && (
          <div className={styles.loadMoreWrapper}>
            <button 
              className={styles.loadMoreBtn} 
              onClick={() => fetchNextPage()} 
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? <Loader2 size={18} className={styles.spin} /> : 'Load More Organizations'}
            </button>
          </div>
        )}
      </div>

      {editModal.isOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{editModal.mode === 'create' ? 'Add New' : 'Edit'} Organization</h2>
              <button onClick={() => setEditModal({ isOpen: false, mode: 'edit', data: null })} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalForm}>
                <div className={styles.inputGroup}>
                  <label>Organization Name</label>
                  <input 
                    type="text"
                    value={editModal.data.name}
                    onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, name: e.target.value.toUpperCase() } })}
                    placeholder="e.g. AL-KHAIR TRUST"
                    style={{ textTransform: 'uppercase' }}
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
                  <div className={styles.multiSelectContainer}>
                    <div 
                      className={styles.multiSelectTrigger}
                      onClick={() => setEditModal(prev => ({ ...prev, isDropdownOpen: !prev.isDropdownOpen }))}
                    >
                      <div className={styles.selectedTags}>
                        {(editModal.data.category_ids || []).length > 0 ? (
                          <span className={styles.countBadge}>
                            {(editModal.data.category_ids || []).length} Categories Selected
                          </span>
                        ) : (
                          <span className={styles.placeholder}>Select categories to bind...</span>
                        )}
                      </div>
                      <ChevronDown size={18} className={`${styles.chevron} ${editModal.isDropdownOpen ? styles.open : ''}`} />
                    </div>

                    {editModal.isDropdownOpen && (
                      <div className={styles.multiSelectDropdown}>
                        <div className={styles.dropdownSearch}>
                          <Search size={14} />
                          <input 
                            type="text" 
                            placeholder="Filter categories..." 
                            value={editModal.catSearch || ''}
                            onChange={(e) => setEditModal(prev => ({ ...prev, catSearch: e.target.value }))}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className={styles.dropdownActions}>
                          <button 
                            type="button" 
                            onClick={() => setEditModal(prev => ({ 
                              ...prev, 
                              data: { ...prev.data, category_ids: categories.map(c => c.id) } 
                            }))}
                          >
                            Select All
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setEditModal(prev => ({ 
                              ...prev, 
                              data: { ...prev.data, category_ids: [] } 
                            }))}
                          >
                            Clear
                          </button>
                        </div>
                        <div className={styles.dropdownList}>
                          {categories
                            .filter(c => c.name.toLowerCase().includes((editModal.catSearch || '').toLowerCase()))
                            .map(cat => (
                              <label key={cat.id} className={styles.dropdownItem}>
                                <input 
                                  type="checkbox"
                                  checked={(editModal.data.category_ids || []).includes(cat.id)}
                                  onChange={() => toggleCategory(cat.id)}
                                />
                                <span>{cat.name}</span>
                              </label>
                            ))
                          }
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {(editModal.data.category_ids || []).length > 0 && (
                  <div className={styles.orderSection}>
                    <div 
                      className={styles.orderDropdownTrigger}
                      onClick={() => setEditModal(prev => ({ ...prev, isOrderDropdownOpen: !prev.isOrderDropdownOpen }))}
                    >
                      <div className={styles.triggerLeft}>
                        <GripVertical size={18} />
                        <span>Manage Display Order</span>
                      </div>
                      <ChevronDown size={18} className={`${styles.chevron} ${editModal.isOrderDropdownOpen ? styles.open : ''}`} />
                    </div>

                    {editModal.isOrderDropdownOpen && (
                      <div className={styles.orderDropdownContent}>
                        <p className={styles.orderHint}>Drag items to change the display order in forms and reports</p>
                        <div className={styles.orderList}>
                          {editModal.data.category_ids.map((id, index) => {
                            const cat = categories.find(c => c.id === id);
                            if (!cat) return null;
                            return (
                              <div 
                                key={id} 
                                className={`${styles.orderItem} ${dragOverIndex === index ? styles.dragOver : ''}`}
                                draggable={true}
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={(e) => handleDrop(e, index)}
                              >
                                <div className={styles.orderLeft}>
                                  <GripVertical size={16} className={styles.gripIcon} />
                                  <span className={styles.orderName}>{cat.name}</span>
                                </div>
                                <span className={styles.orderIndex}>#{index + 1}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setEditModal({ isOpen: false, mode: 'edit', data: null })}>
                Cancel
              </button>
              <button className={styles.saveBtn} onClick={handleSave}>
                {editModal.mode === 'create' ? 'Create' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default TrustsTab;
