import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  MapPin,
  Loader2,
  X,
  Edit,
  Trash2,
  Search
} from 'lucide-react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../../../../hooks/useDebounce';
import { subscribeToCollection } from '../../../../webhook';
import styles from './StreetsTab.module.css';
import { API_ENDPOINTS, getAuthHeaders } from '../../../../api';

const StreetsTab = ({ onConfirmDelete }) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 500); // Faster search response
  const [editModal, setEditModal] = useState({ isOpen: false, mode: 'create', data: null });
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Clear selections when search changes
  useEffect(() => {
    setSelectedIds([]);
  }, [debouncedSearch]);

  // Infinite query for paginated streets
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
    refetch
  } = useInfiniteQuery({
    queryKey: ['streets', debouncedSearch],
    queryFn: async ({ pageParam = 1 }) => {
      let url = `${API_ENDPOINTS.STREETS.BASE}?page=${pageParam}&per_page=20`;
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
    const unsubscribe = subscribeToCollection('streets', (data) => {
      // Invalidate the query to fetch fresh data when anything changes in PB
      queryClient.invalidateQueries({ queryKey: ['streets'] });
    });
    return () => unsubscribe();
  }, [queryClient]);

  const updateGlobalCache = (newStreetName, oldStreetName = null) => {
    try {
      const saved = sessionStorage.getItem('global_cached_streets');
      let streets = saved ? JSON.parse(saved) : [];
      
      if (oldStreetName) {
        streets = streets.filter(s => s !== oldStreetName);
      }
      
      if (newStreetName && !streets.includes(newStreetName)) {
        streets.push(newStreetName);
      }
      
      sessionStorage.setItem('global_cached_streets', JSON.stringify(streets));
    } catch (err) { console.error("Cache update failed:", err); }
  };

  const handleSave = async () => {
    if (!editModal.data || !editModal.data.name.trim()) return;
    const isEdit = editModal.mode === 'edit';
    const oldName = isEdit ? streets.find(s => s.id === editModal.data.id)?.name : null;
    const newName = editModal.data.name.toUpperCase();
    
    const url = isEdit 
      ? API_ENDPOINTS.STREETS.DETAIL(editModal.data.id)
      : API_ENDPOINTS.STREETS.CREATE;
    
    try {
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...editModal.data, name: newName })
      });
      if (response.ok) {
        updateGlobalCache(newName, oldName);
        setEditModal({ isOpen: false, mode: 'create', data: null });
        queryClient.invalidateQueries({ queryKey: ['streets'] });
      } else {
        const errData = await response.json();
        let errorMsg = errData.detail || "An error occurred while saving.";
        if (errorMsg.includes('validation_not_unique')) {
          errorMsg = "This street name already exists.";
        }
        setEditModal(prev => ({ ...prev, error: errorMsg }));
      }
    } catch (err) {
      console.error("Error saving street:", err);
    }
  };

  const handleSelectRow = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const streets = data?.pages.flatMap(page => page.items) || [];
  const loadedIds = streets.map(street => street.id);
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
    
    const selectedNames = streets
      .filter(s => selectedIds.includes(s.id))
      .map(s => s.name);

    onConfirmDelete({
      title: "Delete Multiple Streets",
      message: (
        <div>
          <p style={{ marginBottom: '10px' }}>
            Are you sure you want to delete the following {selectedIds.length} selected streets? This cannot be undone.
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
          const response = await fetch(API_ENDPOINTS.STREETS.BULK_DELETE, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ ids: selectedIds })
          });
          if (response.ok) {
            selectedIds.forEach(id => {
              const streetToDelete = streets.find(s => s.id === id);
              if (streetToDelete) updateGlobalCache(null, streetToDelete.name);
            });
            setSelectedIds([]);
            setIsSelectionMode(false);
            queryClient.invalidateQueries({ queryKey: ['streets'] });
          } else {
            const errData = await response.json();
            alert(errData.detail || "Error bulk deleting streets.");
          }
        } catch (err) {
          console.error("Error bulk deleting streets:", err);
        }
      }
    });
  };

  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.titleGroup}>
          <div className={styles.iconBox}><MapPin size={24} /></div>
          <div>
            <h2>Streets & Localities</h2>
            <p>Manage collection areas and street names</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Search streets..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {!isSelectionMode ? (
            <button 
              className={styles.deleteModeBtn}
              onClick={() => setIsSelectionMode(true)}
              disabled={streets.length === 0}
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
            onClick={() => setEditModal({ isOpen: true, mode: 'create', data: { name: '', description: '' } })}
          >
            <Plus size={18} /> Add New
          </button>
        </div>
      </div>

      {isSelectionMode && streets.length > 0 && (
        <div className={styles.bulkToolbar}>
          <div className={styles.bulkLeft}>
            <input 
              type="checkbox" 
              checked={allSelected} 
              onChange={handleSelectAll} 
              id="selectAllStreets"
              className={styles.rowCheckbox}
            />
            <label htmlFor="selectAllStreets" className={styles.bulkLabel}>
              {selectedIds.length > 0 
                ? `Selected ${selectedIds.length} of ${streets.length} loaded` 
                : `Select All (${streets.length} loaded)`}
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

      <div className={styles.streetGrid}>
        {status === 'pending' ? (
          <div className={styles.loader}><Loader2 size={24} className={styles.spin} /></div>
        ) : streets.length === 0 ? (
          <div className={styles.empty}>No streets found.</div>
        ) : (
          streets.map(street => (
            <div key={street.id} className={styles.categoryCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                {isSelectionMode && (
                  <input 
                    type="checkbox" 
                    checked={selectedIds.includes(street.id)} 
                    onChange={() => handleSelectRow(street.id)} 
                    className={styles.rowCheckbox}
                  />
                )}
                <div className={styles.streetInfo}>
                  <span className={styles.catName}>{street.name}</span>
                  {street.description && <p className={styles.description}>{street.description}</p>}
                </div>
              </div>
              <div className={styles.catActions}>
                <button onClick={() => setEditModal({ isOpen: true, mode: 'edit', data: { ...street } })} className={styles.editBtn}>
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
            {isFetchingNextPage ? <Loader2 size={18} className={styles.spin} /> : 'Load More Localities'}
          </button>
        </div>
      )}

      {editModal.isOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{editModal.mode === 'create' ? 'Add New' : 'Edit'} Street</h2>
              <button onClick={() => setEditModal({ isOpen: false, mode: 'create', data: null })} className={styles.closeBtn}>
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
                    <label>Street Name</label>
                    <input 
                      type="text"
                      value={editModal.data.name}
                      onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, name: e.target.value.toUpperCase() } })}
                      placeholder="e.g. MG ROAD"
                      autoFocus
                      style={{ textTransform: 'uppercase' }}
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label>Description (Optional)</label>
                    <input 
                      type="text"
                      value={editModal.data.description}
                      onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, description: e.target.value } })}
                      placeholder="e.g. Near Market Square"
                    />
                  </div>
               </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setEditModal({ isOpen: false, mode: 'create', data: null })}>
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

export default StreetsTab;
