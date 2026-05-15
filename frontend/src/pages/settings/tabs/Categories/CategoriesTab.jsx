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
import { API_ENDPOINTS } from '../../../../api';

const CategoriesTab = ({ onConfirmDelete }) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 500); // Faster search response
  const [editModal, setEditModal] = useState({ isOpen: false, mode: 'edit', data: null });

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
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Network response was not ok');
      return response.json();
    },
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.total / lastPage.per_page);
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
  });

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToCollection('categories', (data) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    });
    return () => unsubscribe();
  }, [queryClient]);

  const handleSave = async () => {
    if (!editModal.data || !editModal.data.name.trim()) {
      alert("Category Name is required.");
      return;
    }
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
        setEditModal({ isOpen: false, mode: 'edit', data: null });
        queryClient.invalidateQueries({ queryKey: ['categories'] });
      }
    } catch (err) {
      console.error("Error saving category:", err);
    }
  };

  const handleDelete = (id) => {
    onConfirmDelete({
      title: "Delete Category",
      message: "Are you sure you want to delete this category? This cannot be undone.",
      confirmText: "Delete",
      onConfirm: async () => {
        try {
          const res = await fetch(API_ENDPOINTS.CATEGORIES.DETAIL(id), { method: 'DELETE' });
          if (res.ok) {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
          } else {
            const errData = await res.json();
            alert(errData.detail || "Could not delete category.");
          }
        } catch (err) {
          console.error(err);
        }
      }
    });
  };

  const categories = data?.pages.flatMap(page => page.items) || [];

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
          <button 
            className={styles.addPrimaryBtn}
            onClick={() => setEditModal({ isOpen: true, mode: 'create', data: { name: '' } })}
          >
            <Plus size={18} /> Add New
          </button>
        </div>
      </div>

      <div className={styles.categoryGrid}>
        {status === 'pending' ? (
          <div className={styles.loader}><Loader2 size={24} className={styles.spin} /></div>
        ) : categories.length === 0 ? (
          <div className={styles.empty}>No categories found.</div>
        ) : (
          categories.map(category => (
            <div key={category.id} className={styles.categoryCard}>
              <span className={styles.catName}>{category.name}</span>
              <div className={styles.catActions}>
                <button onClick={() => setEditModal({ isOpen: true, mode: 'edit', data: { ...category } })} className={styles.editBtn}>
                  <Edit size={14} />
                </button>
                <button onClick={() => handleDelete(category.id)} className={styles.deleteBtn}>
                  <Trash2 size={14} />
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
