import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Users,
  Loader2,
  X,
  Edit,
  Trash2,
  Search,
  Phone,
  MapPin,
  User
} from 'lucide-react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useDebounce } from '../../../../hooks/useDebounce';
import { subscribeToCollection } from '../../../../webhook';
import styles from './DonorsTab.module.css';
import { API_ENDPOINTS, getAuthHeaders } from '../../../../api';
import StreetSelect from '../../../entry/StreetSelect';

const DonorsTab = ({ onConfirmDelete }) => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 500); // Faster search response
  const [editModal, setEditModal] = useState({ isOpen: false, mode: 'create', data: null });
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Clear selections when search changes
  useEffect(() => {
    setSelectedIds([]);
  }, [debouncedSearch]);

  // Turn off selection mode when search is active or list changes could be useful,
  // but let's keep it simple and just clear selected IDs.

  useEffect(() => {
    if (location.state && location.state.openAddModal) {
      setEditModal({ 
        isOpen: true, 
        mode: 'create', 
        data: { name: '', gender: 'M', mobile: '', door_no: '', street: '', is_member: false, member_id: '' } 
      });
      // Clear location state so reloading doesn't pop it up again
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Infinite query for paginated donors
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status
  } = useInfiniteQuery({
    queryKey: ['donors', debouncedSearch],
    queryFn: async ({ pageParam = 1 }) => {
      let url = `${API_ENDPOINTS.DONORS.BASE}?page=${pageParam}&per_page=20`;
      if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;
      
      const response = await fetch(url, { headers: getAuthHeaders() });
      if (!response.ok) throw new Error('Network response was not ok');
      return response.json();
    },
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.total / lastPage.per_page);
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToCollection('donors', (data) => {
      queryClient.invalidateQueries({ queryKey: ['donors'] });
    });
    return () => unsubscribe();
  }, [queryClient]);

  const updateGlobalDonorCache = () => {
    sessionStorage.removeItem('entry_last_searched_donors');
  };

  const handleSave = async () => {
    if (!editModal.data || !editModal.data.name.trim()) return;
    const isEdit = editModal.mode === 'edit';
    const url = isEdit 
      ? API_ENDPOINTS.DONORS.DETAIL(editModal.data.id)
      : API_ENDPOINTS.DONORS.CREATE;
    
    try {
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(editModal.data)
      });
      if (response.ok) {
        updateGlobalDonorCache();
        setEditModal({ isOpen: false, mode: 'create', data: null });
        queryClient.invalidateQueries({ queryKey: ['donors'] });
      } else {
        const errData = await response.json();
        let errorMsg = errData.detail || "An error occurred while saving.";
        if (errorMsg.includes('validation_not_unique') || errorMsg.includes('Failed to create record') || errorMsg.includes('UNIQUE constraint failed')) {
          if (errorMsg.includes("'mobile'") && errorMsg.includes('validation_not_unique')) {
            errorMsg = "This mobile number is already registered to another donor.";
          } else {
            errorMsg = "A donor with this exact name and street (or mobile number) already exists.";
          }
        }
        setEditModal(prev => ({ ...prev, error: errorMsg }));
      }
    } catch (err) {
      console.error("Error saving donor:", err);
    }
  };

  const handleSelectRow = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const donors = data?.pages.flatMap(page => page.items) || [];
  const loadedIds = donors.map(donor => donor.id);
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
    
    const selectedNames = donors
      .filter(d => selectedIds.includes(d.id))
      .map(d => d.name);

    onConfirmDelete({
      title: "Delete Multiple Donors",
      message: (
        <div>
          <p style={{ marginBottom: '10px' }}>
            Are you sure you want to delete the following {selectedIds.length} selected donors? This will also delete ALL their transactions and ledger histories. This cannot be undone.
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
          const response = await fetch(API_ENDPOINTS.DONORS.BULK_DELETE, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ ids: selectedIds })
          });
          if (response.ok) {
            setSelectedIds([]);
            setIsSelectionMode(false);
            updateGlobalDonorCache();
            queryClient.invalidateQueries({ queryKey: ['donors'] });
          } else {
            const errData = await response.json();
            alert(errData.detail || "Error bulk deleting donors.");
          }
        } catch (err) {
          console.error("Error bulk deleting donors:", err);
        }
      }
    });
  };

  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.titleGroup}>
          <div className={styles.iconBox}><Users size={24} /></div>
          <div>
            <h2>Donor Registry</h2>
            <p>Manage and search your donor database</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Search donors..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {!isSelectionMode ? (
            <button 
              className={styles.deleteModeBtn}
              onClick={() => setIsSelectionMode(true)}
              disabled={donors.length === 0}
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
            onClick={() => setEditModal({ isOpen: true, mode: 'create', data: { name: '', gender: 'M', mobile: '', door_no: '', street: '', is_member: false, member_id: '' } })}
          >
            <Plus size={18} /> Add New
          </button>
        </div>
      </div>

      {isSelectionMode && donors.length > 0 && (
        <div className={styles.bulkToolbar}>
          <div className={styles.bulkLeft}>
            <input 
              type="checkbox" 
              checked={allSelected} 
              onChange={handleSelectAll} 
              id="selectAllDonors"
              className={styles.rowCheckbox}
            />
            <label htmlFor="selectAllDonors" className={styles.bulkLabel}>
              {selectedIds.length > 0 
                ? `Selected ${selectedIds.length} of ${donors.length} loaded` 
                : `Select All (${donors.length} loaded)`}
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
        ) : donors.length === 0 ? (
          <div className={styles.empty}>No donors found.</div>
        ) : (
          donors.map(donor => (
            <div key={donor.id} className={styles.categoryCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                {isSelectionMode && (
                  <input 
                    type="checkbox" 
                    checked={selectedIds.includes(donor.id)} 
                    onChange={() => handleSelectRow(donor.id)} 
                    className={styles.rowCheckbox}
                  />
                )}
                <div className={styles.donorInfo}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className={styles.catName}>{donor.name}</span>
                    {donor.is_member && (
                      <span className={styles.memberBadge}>
                        Member {donor.member_id ? `#${donor.member_id}` : ''}
                      </span>
                    )}
                  </div>
                  <div className={styles.metadata}>
                    <span><Phone size={12} /> {donor.mobile || 'No mobile'}</span>
                    <span><MapPin size={12} /> {donor.street ? `${donor.door_no ? donor.door_no + ', ' : ''}${donor.street}` : 'No address'}</span>
                  </div>
                </div>
              </div>
              <div className={styles.catActions}>
                <button onClick={() => setEditModal({ isOpen: true, mode: 'edit', data: { ...donor } })} className={styles.editBtn}>
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
            {isFetchingNextPage ? <Loader2 size={18} className={styles.spin} /> : 'Load More Donors'}
          </button>
        </div>
      )}

      {editModal.isOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{editModal.mode === 'create' ? 'Add New' : 'Edit'} Donor</h2>
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
                    <label>Full Name</label>
                    <input 
                      type="text"
                      value={editModal.data.name}
                      onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, name: e.target.value.toUpperCase() } })}
                      placeholder="DONOR'S FULL NAME"
                      autoFocus
                      style={{ textTransform: 'uppercase' }}
                    />
                  </div>
                  <div className={styles.modalGrid}>
                    <div className={styles.inputGroup}>
                      <label>Gender</label>
                      <select 
                        value={editModal.data.gender}
                        onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, gender: e.target.value } })}
                      >
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                      </select>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Door No.</label>
                      <input 
                        type="text"
                        value={editModal.data.door_no}
                        onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, door_no: e.target.value } })}
                        placeholder="e.g. 12/A"
                      />
                    </div>
                  </div>

                  <div className={styles.inputGroup}>
                    <label>Mobile Number</label>
                    <input 
                      type="text"
                      value={editModal.data.mobile}
                      onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, mobile: e.target.value } })}
                      placeholder="10-digit number"
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <label>Street / Locality</label>
                    <StreetSelect 
                      value={editModal.data.street}
                      onChange={(val) => setEditModal({ ...editModal, data: { ...editModal.data, street: val } })}
                      placeholder="Search or add street..."
                    />
                  </div>

                  <div className={styles.toggleRow}>
                    <div className={styles.toggleLabel}>
                      <span>Is Member?</span>
                      <span className={styles.toggleSub}>Toggle if the donor is a registered member</span>
                    </div>
                    <label className={styles.switch}>
                      <input 
                        type="checkbox"
                        checked={editModal.data.is_member || false}
                        onChange={(e) => setEditModal({ 
                          ...editModal, 
                          data: { 
                            ...editModal.data, 
                            is_member: e.target.checked,
                            member_id: e.target.checked ? editModal.data.member_id : ''
                          } 
                        })}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  {editModal.data.is_member && (
                    <div className={styles.inputGroup}>
                      <label>Member ID</label>
                      <input 
                        type="number"
                        value={editModal.data.member_id || ''}
                        onChange={(e) => setEditModal({ 
                          ...editModal, 
                          data: { ...editModal.data, member_id: e.target.value } 
                        })}
                        placeholder="Enter member ID (can be empty)"
                      />
                    </div>
                  )}
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

export default DonorsTab;
