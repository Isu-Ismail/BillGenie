import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit,
  PieChart,
  Loader2,
  X,
  Search
} from 'lucide-react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../../../../hooks/useDebounce';
import { subscribeToCollection } from '../../../../webhook';
import styles from './CategoriesTab.module.css';
import { API_ENDPOINTS, getAuthHeaders } from '../../../../api';

const CategoriesTab = ({ onConfirmDelete }) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 500); // Faster search response
  const [editModal, setEditModal] = useState({ isOpen: false, mode: 'edit', data: null });
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Clear selections when search changes
  useEffect(() => {
    setSelectedIds([]);
  }, [debouncedSearch]);

  // Infinite query for paginated categories
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status
  } = useInfiniteQuery({
    queryKey: ['categories', debouncedSearch],
    queryFn: async ({ pageParam = 1 }) => {
      let url = `${API_ENDPOINTS.CATEGORIES.BASE}?page=${pageParam}&per_page=20`;
      if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;
      
      const response = await fetch(url, { headers: getAuthHeaders() });
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
    const unsubscribe = subscribeToCollection('categories', (data) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    });
    return () => unsubscribe();
  }, [queryClient]);

  const updateGlobalCache = (newCategory, oldCategoryId = null) => {
    try {
      const userJson = localStorage.getItem('user');
      const userId = userJson ? JSON.parse(userJson)?.id : 'default';
      const CAT_KEY = `global_cached_categories_${userId}`;

      // 1. Update Reports general cache
      const saved = sessionStorage.getItem(CAT_KEY);
      let cats = saved ? JSON.parse(saved) : [];
      
      if (oldCategoryId) {
        cats = cats.filter(c => c.id !== oldCategoryId);
      }
      
      if (newCategory) {
        // If edit, replace
        cats = cats.filter(c => c.id !== newCategory.id);
        cats.push(newCategory);
      }
      
      sessionStorage.setItem(CAT_KEY, JSON.stringify(cats));

      // 2. Clear trust-specific category caches to force refresh on entry page
      sessionStorage.removeItem('entry_trust_category_cache');
    } catch (err) { console.error("Cache update failed:", err); }
  };

  const handleSave = async () => {
    if (!editModal.data || !editModal.data.name.trim()) {
      alert("Category Name is required.");
      return;
    }
    const isEdit = editModal.mode === 'edit';
    const newName = editModal.data.name.trim().toUpperCase();
    
    const url = isEdit 
      ? API_ENDPOINTS.CATEGORIES.DETAIL(editModal.data.id)
      : API_ENDPOINTS.CATEGORIES.CREATE;
    
    try {
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(isEdit ? { ...editModal.data, name: newName } : { name: newName })
      });
      if (response.ok) {
        const savedCat = await response.json();
        updateGlobalCache(savedCat, isEdit ? savedCat.id : null);
        setEditModal({ isOpen: false, mode: 'edit', data: null });
        queryClient.invalidateQueries({ queryKey: ['categories'] });
      } else {
        const errData = await response.json();
        let errorMsg = errData.detail || "An error occurred while saving.";
        if (errorMsg.includes('validation_not_unique')) {
          errorMsg = "This category name already exists.";
        }
        setEditModal(prev => ({ ...prev, error: errorMsg }));
      }
    } catch (err) {
      console.error("Error saving category:", err);
    }
  };

  const handleSelectRow = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const categories = data?.pages.flatMap(page => page.items) || [];
  const loadedIds = categories.map(cat => cat.id);
  const allSelected = loadedIds.length > 0 && loadedIds.every(id => selectedIds.includes(id));

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !loadedIds.includes(id)));
    } else {
      setSelectedIds(prev => {
        const otherSelected = prev.filter(id => !loadedIds.includes(id));
        return [...otherSelected, ...loadedIds];
      });
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    
    const selectedNames = categories
      .filter(c => selectedIds.includes(c.id))
      .map(c => c.name);

    onConfirmDelete({
      title: "Delete Multiple Categories",
      message: (
        <div>
          <p style={{ marginBottom: '10px' }}>
            Are you sure you want to delete the following {selectedIds.length} selected categories? This cannot be undone.
          </p>
          <div style={{
            maxHeight: '120px',
            overflowY: 'auto',
            background: 'var(--bg-main)',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            textAlign: 'left',
            fontSize: '0.85rem'
          }}>
            <ul style={{ margin: 0, paddingLeft: '16px', listStyleType: 'disc' }}>
              {selectedNames.map((name, i) => (
                <li key={i} style={{ color: 'var(--text-main)', fontWeight: 600 }}>{name}</li>
              ))}
            </ul>
          </div>
        </div>
      ),
      confirmText: "Delete Selected",
      onConfirm: async () => {
        try {
          const response = await fetch(API_ENDPOINTS.CATEGORIES.BULK_DELETE, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ ids: selectedIds })
          });
          if (response.ok) {
            selectedIds.forEach(id => updateGlobalCache(null, id));
            setSelectedIds([]);
            setIsSelectionMode(false);
            queryClient.invalidateQueries({ queryKey: ['categories'] });
          } else {
            const errData = await response.json();
            alert(errData.detail || "Error bulk deleting categories.");
          }
        } catch (err) {
          console.error("Error bulk deleting categories:", err);
        }
      }
    });
  };

  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.titleGroup}>
          <div className={styles.iconBox}><PieChart size={24} /></div>
          <div>
            <h2>Expense Categories</h2>
            <p>Manage donation classification tags</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Search categories..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {!isSelectionMode ? (
            <button 
              className={styles.deleteModeBtn}
              onClick={() => setIsSelectionMode(true)}
              disabled={categories.length === 0}
            >
              <Trash2 size={18} /> Delete
            </button>
          ) : (
            <button 
              className={styles.cancelSelectionBtn}
              onClick={() => {
                setIsSelectionMode(false);
                setSelectedIds([]);
              }}
            >
              <X size={18} /> Cancel
            </button>
          )}
          <button 
            className={styles.addPrimaryBtn}
            onClick={() => setEditModal({ isOpen: true, mode: 'create', data: { name: '' } })}
          >
            <Plus size={18} /> Add New
          </button>
        </div>
      </div>

      {isSelectionMode && categories.length > 0 && (
        <div className={styles.bulkToolbar}>
          <div className={styles.bulkLeft}>
            <input 
              type="checkbox" 
              checked={allSelected} 
              onChange={handleSelectAll} 
              id="selectAllCategories"
              className={styles.rowCheckbox}
            />
            <label htmlFor="selectAllCategories" className={styles.bulkLabel}>
              {selectedIds.length > 0 
                ? `Selected ${selectedIds.length} of ${categories.length} loaded` 
                : `Select All (${categories.length} loaded)`}
            </label>
          </div>
          <button 
            className={styles.bulkDeleteBtn} 
            onClick={handleBulkDelete}
            disabled={selectedIds.length === 0}
            style={selectedIds.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            <Trash2 size={16} /> Delete Selected ({selectedIds.length})
          </button>
        </div>
      )}

      <div className={styles.categoryGrid}>
        {status === 'pending' ? (
          <div className={styles.loader}><Loader2 size={24} className={styles.spin} /></div>
        ) : categories.length === 0 ? (
          <div className={styles.empty}>No categories found.</div>
        ) : (
          categories.map(category => (
            <div key={category.id} className={styles.categoryCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                {isSelectionMode && (
                  <input 
                    type="checkbox" 
                    checked={selectedIds.includes(category.id)} 
                    onChange={() => handleSelectRow(category.id)} 
                    className={styles.rowCheckbox}
                  />
                )}
                <span className={styles.catName}>{category.name}</span>
              </div>
              <div className={styles.catActions}>
                <button onClick={() => setEditModal({ isOpen: true, mode: 'edit', data: { ...category } })} className={styles.editBtn}>
                  <Edit size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {hasNextPage && (
        <div className={styles.loadMoreWrapper}>
          <button 
            className={styles.loadMoreBtn} 
            onClick={() => fetchNextPage()} 
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? <Loader2 size={18} className={styles.spin} /> : 'Load More Categories'}
          </button>
        </div>
      )}

      {editModal.isOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{editModal.mode === 'create' ? 'Add New' : 'Edit'} Category</h2>
              <button onClick={() => setEditModal({ isOpen: false, mode: 'edit', data: null })} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {editModal.error && (
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.9rem' }}>
                  {editModal.error}
                </div>
              )}
              <div className={styles.modalForm}>
                <div className={styles.inputGroup}>
                  <label>Category Name</label>
                  <input 
                    type="text"
                    value={editModal.data.name}
                    onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, name: e.target.value.toUpperCase() } })}
                    placeholder="e.g. MOSQUE FUND"
                    autoFocus
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
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

export default CategoriesTab;
