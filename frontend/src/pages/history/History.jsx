import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  MoreVertical,
  Printer,
  FileText,
  Trash2,
  Calendar,
  Edit3,
  X,
  AlertCircle,
  Save,
  Plus,
  CheckCircle,
  Clock,
  RefreshCcw
} from 'lucide-react';
import styles from './History.module.css';
import DonorSearch from '../entry/DonorSearch';
import { useHistory } from '../../context/HistoryContext';
import { API_ENDPOINTS } from '../../api';

const History = () => {
  const { 
    transactions, setTransactions, 
    hasLoadedOnce, setHasLoadedOnce,
    categories, setCategories,
    lastFilters, setLastFilters
  } = useHistory();

  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [itemsPerRow, setItemsPerRow] = useState(3);
  const [trusts, setTrusts] = useState([]);
  const [filters, setFilters] = useState({ ...lastFilters, year_only: false, trust_id: '' });
  
  // Edit Modal State
  const [editModal, setEditModal] = useState({ show: false, transaction: null });
  const [message, setMessage] = useState({ type: '', text: '' });

  const fetchTrusts = async () => {
    try {
      const res = await fetch(API_ENDPOINTS.TRUSTS.BASE);
      const data = await res.json();
      setTrusts(data);
    } catch (err) {
      console.error("Fetch trusts failed:", err);
    }
  };

  useEffect(() => {
    const init = async () => {
      // Calculate initial items per row
      const cols = calculateItemsPerRow();
      setItemsPerRow(cols);

      if (categories.length === 0) await fetchCategories();
      await fetchTrusts();
      if (!hasLoadedOnce) {
        await fetchTransactions(1, true, cols * 3);
        setHasLoadedOnce(true);
      }
    };
    init();

    // Resize listener to adjust "Load More" logic if screen size changes
    const handleResize = () => {
      setItemsPerRow(calculateItemsPerRow());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const calculateItemsPerRow = () => {
    const width = window.innerWidth;
    if (width >= 1100) return 3;
    if (width >= 768) return 2;
    return 1;
  };


  // Update global filters when local filters change (so they persist when coming back)
  useEffect(() => {
    setLastFilters(filters);
  }, [filters]);

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    const cols = calculateItemsPerRow();
    setPage(1);
    fetchTransactions(1, true, cols * 3);
  };

  const handleReload = () => {
    const cols = calculateItemsPerRow();
    setPage(1);
    fetchTransactions(1, true, cols * 3);
  };




  const fetchCategories = async () => {
    try {
      const res = await fetch(API_ENDPOINTS.CATEGORIES.BASE);
      if (res.ok) setCategories(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchTransactions = async (pageNum = 1, reset = false, perPageOverride = null) => {
    setLoading(true);
    try {
      const { donor_id, hijri_year, all_user_tx, year_only, trust_id } = filters;
      
      const perPage = perPageOverride || (itemsPerRow * 3);
      let url = `${API_ENDPOINTS.TRANSACTIONS.BASE}?page=${pageNum}&per_page=${perPage}`;
      
      if (donor_id && !year_only) url += `&donor_id=${donor_id}`;
      // If 'All Transactions' is checked, we ignore the hijri_year filter
      if (hijri_year && !all_user_tx) url += `&hijri_year=${hijri_year}`;
      if (trust_id) url += `&trust_id=${trust_id}`;
      
      const res = await fetch(url);


      const result = await res.json();
      
      if (result.status) {
        if (reset) {
          setTransactions(result.data);
        } else {
          setTransactions(prev => [...prev, ...result.data]);
        }
        setHasMore(pageNum < result.pagination.total_pages);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateBillHTML = (t) => {
    const donor = t.expand?.donor_id || {};
    const trust = {
      name: t.trust_name || 'Organization Name',
      address: t.trust_address || '',
      mobile: t.trust_mobile || ''
    };

    
    const itemsHTML = (t.items || []).map(item => {
      const cat = categories.find(c => c.id === item.category_id);
      const catName = cat ? cat.name : 'General';
      return `
        <tr>
          <td contenteditable="true" style="padding: 10px; border: 1px solid #000; text-align: left;">${catName}</td>
          <td contenteditable="true" style="padding: 10px; border: 1px solid #000; text-align: center;">${item.date}</td>
          <td contenteditable="true" style="padding: 10px; border: 1px solid #000; text-align: right; font-weight: bold;">₹${item.amount.toFixed(2)}</td>
        </tr>
      `;
    }).join('');


    return `
      <div class="bill-page" style="font-family: Arial, sans-serif; padding: 40px; color: #000; max-width: 800px; margin: 20px auto; background: white; border: 2px solid #000; min-height: 1000px; box-sizing: border-box; display: flex; flex-direction: column;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px;">
          <h1 contenteditable="true" style="margin: 0; font-size: 32px; text-transform: uppercase; letter-spacing: 2px;">${trust.name}</h1>
          <p contenteditable="true" style="margin: 8px 0; font-size: 16px;">${trust.address} | Tel: ${trust.mobile}</p>
          <div style="display: inline-block; border: 2px solid #000; padding: 5px 20px; margin-top: 10px; font-weight: bold; font-size: 20px;">DONATION RECEIPT</div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div style="width: 55%; border: 1.5px solid #000; padding: 15px; border-radius: 4px;">
            <p style="margin: 0 0 10px; font-size: 13px; font-weight: bold; text-decoration: underline; text-transform: uppercase;">Donor Particulars:</p>
            <div style="font-size: 16px; line-height: 1.6;">
              <p contenteditable="true" style="margin: 5px 0;"><strong>Name:</strong> ${t.donor_name}</p>
              <p contenteditable="true" style="margin: 5px 0;"><strong>Address:</strong> ${donor.door_no ? donor.door_no + ', ' : ''}${donor.street || 'N/A'}</p>
              <p contenteditable="true" style="margin: 5px 0;"><strong>Mobile:</strong> ${donor.mobile || 'N/A'}</p>
            </div>
          </div>
          <div style="width: 40%; border: 1.5px solid #000; padding: 15px; border-radius: 4px; text-align: right;">
            <p style="margin: 5px 0; font-size: 15px;"><strong>Receipt No:</strong> <span style="font-family: monospace; font-size: 16px;">${t.id.toUpperCase()}</span></p>
            <p style="margin: 5px 0; font-size: 15px;"><strong>Issue Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p style="margin: 5px 0; font-size: 15px;"><strong>Hijri Year:</strong> ${t.hijri_year} AH</p>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; border: 2px solid #000;">
          <thead>
            <tr style="background: #f2f2f2; border-bottom: 2px solid #000;">
              <th style="padding: 12px; border-right: 1px solid #000; text-align: left; text-transform: uppercase; font-size: 14px;">Description of Donation</th>
              <th style="padding: 12px; border-right: 1px solid #000; text-align: center; text-transform: uppercase; font-size: 14px;">Date</th>
              <th style="padding: 12px; text-align: right; text-transform: uppercase; font-size: 14px;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
          <tfoot style="border-top: 2px solid #000;">
            <tr>
              <td colspan="2" style="padding: 15px; border-right: 1px solid #000; text-align: right; font-weight: bold; font-size: 16px;">GRAND TOTAL:</td>
              <td style="padding: 15px; text-align: right; font-weight: bold; font-size: 22px; background: #fafafa;">₹${t.total_amount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div style="margin-top: auto; padding-top: 40px; display: flex; justify-content: space-between; align-items: flex-end;">
          <div style="font-size: 13px; color: #333; width: 60%; font-style: italic;">
            <p style="margin: 0;">* This is a computer generated official receipt of Community Welfare Trust.</p>
            <p style="margin: 4px 0;">* Thank you for your contribution towards the welfare of the community.</p>
          </div>
          <div style="text-align: center; width: 220px;">
            <p style="margin-bottom: 60px; font-size: 15px; font-weight: bold;">For ${trust.name}</p>

            <div style="border-top: 1px solid #000; width: 100%;"></div>
            <p style="margin: 8px 0; font-weight: bold; text-transform: uppercase;">Authorized Signatory</p>
          </div>
        </div>
      </div>
    `;
  };

  const handlePrintCard = async (t) => {

    setLoading(true);
    try {
      const donorId = t.donor_id;
      const res = await fetch(API_ENDPOINTS.DONORS.DETAIL(donorId));
      const donorResult = await res.json();

      
      let finalDonorData = t.expand?.donor_id || {};
      if (donorResult.status) {
        finalDonorData = donorResult.data;
      }

      const html = generateBillHTML({ ...t, expand: { ...t.expand, donor_id: finalDonorData } });
      
      const printWindow = window.open('', '_blank', 'width=900,height=950');
      printWindow.document.write(`
        <html>
          <head>
            <title>Receipt - ${t.donor_name}</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
            <style>
              body { margin: 0; padding: 0; background: #525659; display: flex; justify-content: center; padding-top: 20px; }
              .bill-page { 
                width: 210mm; 
                min-height: 297mm; 
                padding: 20mm; 
                margin: 10mm auto; 
                background: white; 
                box-shadow: 0 0 10px rgba(0,0,0,0.5);
                box-sizing: border-box;
              }
              @media print {
                body { background: white; padding: 0; }
                .bill-page { margin: 0; box-shadow: none; border: none; }
              }
            </style>
          </head>
          <body>
            <div id="bill-content">${html}</div>
            <script>
              window.onload = () => {
                const element = document.getElementById('bill-content');
                const opt = {
                  margin: 0,
                  filename: 'Receipt_${t.donor_name.replace(/\s+/g, '_')}_${t.id}.pdf',
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 2, useCORS: true },
                  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };
                
                // New logic: Show preview and provide a download button, or auto-download
                html2pdf().set(opt).from(element).save().then(() => {
                  // Optional: close window after download
                  // window.close();
                });
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error("Print/PDF failed:", err);
    } finally {
      setLoading(false);
    }
  };



  const handlePrintAll = async () => {
    if (transactions.length === 0) return;
    setLoading(true);
    try {
      // Fetch fresh donor details for all transactions in parallel
      const enrichedTransactions = await Promise.all(transactions.map(async (t) => {
        try {
          const res = await fetch(API_ENDPOINTS.DONORS.DETAIL(t.donor_id));
          const donorResult = await res.json();
          if (donorResult.status) {
            return { ...t, expand: { ...t.expand, donor_id: donorResult.data } };
          }
        } catch (e) {
          console.warn("Failed to fetch donor for bulk print:", t.donor_id);
        }
        return t;
      }));

      const allHTML = enrichedTransactions.map(t => generateBillHTML(t)).join('');
      
      const printWindow = window.open('', '_blank', 'width=900,height=950');
      printWindow.document.write(`
        <html>
          <head>
            <title>Bulk Receipts Export</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
            <style>
              body { margin: 0; padding: 0; background: #525659; display: flex; flex-direction: column; align-items: center; padding-top: 20px; }
              .bill-page { 
                width: 210mm; 
                min-height: 297mm; 
                padding: 20mm; 
                margin: 10mm auto; 
                background: white; 
                box-shadow: 0 0 10px rgba(0,0,0,0.5);
                box-sizing: border-box;
                page-break-after: always;
              }
              @media print {
                body { background: white; padding: 0; }
                .bill-page { margin: 0; box-shadow: none; border: none; }
              }
            </style>
          </head>
          <body>
            <div id="bulk-content">${allHTML}</div>
            <script>
              window.onload = () => {
                const element = document.getElementById('bulk-content');
                const opt = {
                  margin: 0,
                  filename: 'Bulk_Receipts_${new Date().toISOString().split('T')[0]}.pdf',
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 1.5, useCORS: true },
                  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };
                html2pdf().set(opt).from(element).save();
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error("Bulk PDF failed:", err);
    } finally {
      setLoading(false);
    }
  };



  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    // Fetch 3 rows based on current itemsPerRow
    fetchTransactions(nextPage, false, itemsPerRow * 3);
  };



  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this entire annual ledger?")) return;
    
    try {
      const res = await fetch(API_ENDPOINTS.TRANSACTIONS.DETAIL(id), { method: 'DELETE' });
      const result = await res.json();
      if (result.status) {
        setTransactions(transactions.filter(t => t.id !== id));
        setMessage({ type: 'success', text: result.msg });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Delete failed' });
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    const t = editModal.transaction;
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.TRANSACTIONS.DETAIL(t.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: t.items,
          total_amount: t.items.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0),
          hijri_year: t.hijri_year,
          payment_date: t.payment_date,
          notes: t.notes,
          trust_id: t.trust_id
        })
      });


      const result = await res.json();
      if (result.status) {
        setEditModal({ show: false, transaction: null });
        const cols = calculateItemsPerRow();
        fetchTransactions(1, true, cols * 3); // Reset to first page and clear old state
        setMessage({ type: 'success', text: result.msg });
      }

    } catch (err) {
      setMessage({ type: 'error', text: 'Update failed' });
    } finally {
      setLoading(false);
    }
  };

  const updateEditItem = (index, field, value) => {
    const updated = { ...editModal.transaction };
    updated.items[index][field] = value;
    setEditModal({ ...editModal, transaction: updated });
  };

  const addEditItem = () => {
    const updated = { ...editModal.transaction };
    updated.items.push({ category_id: '', amount: 0, date: new Date().toISOString().split('T')[0] });
    setEditModal({ ...editModal, transaction: updated });
  };

  const removeEditItem = (index) => {
    const updated = { ...editModal.transaction };
    updated.items = updated.items.filter((_, i) => i !== index);
    setEditModal({ ...editModal, transaction: updated });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Annual Ledgers</h1>
          <p className={styles.subtitle}>View and manage yearly donation history</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.secondaryBtn} onClick={handleReload} disabled={loading}>
            <RefreshCcw size={18} className={loading ? styles.spin : ''} /> Reload Data
          </button>
          <button type="button" className={styles.printAllBtn} onClick={handlePrintAll} disabled={loading}>
             <Printer size={18} /> Print All Page
          </button>
        </div>
      </header>


      <form onSubmit={handleSearch} className={styles.filterBar}>
        <div className={styles.trustFilterSection}>
          <label>Trust</label>
          <select 
            value={filters.trust_id} 
            onChange={(e) => setFilters({...filters, trust_id: e.target.value})}
            className={styles.trustSelectInput}
          >
            <option value="">All Trusts</option>
            {trusts.map(trust => (
              <option key={trust.id} value={trust.id}>{trust.name}</option>
            ))}
          </select>
        </div>

        <div className={styles.donorFilter}>

           <div className={styles.labelWithCheckbox}>
             <label>Donor</label>
             <label className={styles.customCheckbox}>
               <input 
                 type="checkbox" 
                 checked={filters.year_only} 
                 onChange={(e) => setFilters({...filters, year_only: e.target.checked})}
               />
               <span className={styles.checkmark}></span>
               Search Year Wise
             </label>
           </div>
           <DonorSearch 
             value={filters.donor_id}
             onChange={(val) => setFilters({...filters, donor_id: val})}
             placeholder="Search by name..."
             disabled={filters.year_only}
           />
        </div>
        <div className={styles.yearFilter}>
          <div className={styles.labelWithCheckbox}>
            <label>Hijri Year</label>
            <label className={styles.customCheckbox}>
              <input 
                type="checkbox" 
                checked={filters.all_user_tx} 
                disabled={filters.year_only}
                onChange={(e) => setFilters({...filters, all_user_tx: e.target.checked})}
              />
              <span className={styles.checkmark}></span>
              All Years
            </label>
          </div>
          <input 
            type="text"
            placeholder="e.g. 1446"
            value={filters.hijri_year}
            disabled={filters.all_user_tx}
            onChange={(e) => setFilters({...filters, hijri_year: e.target.value})}
          />
        </div>
        <div className={styles.filterButtons}>
          <button type="submit" className={styles.searchBtn} disabled={loading}>
            <Search size={18} /> Search
          </button>

          <button type="button" className={styles.resetBtn} onClick={() => {
            setFilters({ donor_id: '', hijri_year: '', all_user_tx: false, year_only: false, trust_id: '' });
            setTimeout(() => handleReload(), 10);
          }}>

            Clear
          </button>
        </div>
      </form>


      {message.text && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
          <X size={16} onClick={() => setMessage({ type: '', text: '' })} style={{cursor: 'pointer'}}/>
        </div>
      )}

      <div className={styles.gridContainer}>
        {loading && (
          <div className={styles.loadingOverlay}>
             <Clock className={styles.spin} size={40} />
             <span style={{color: 'white', marginTop: '10px', fontSize: '14px'}}>Updating Ledger...</span>
          </div>
        )}

        <div className={styles.grid}>
          {transactions.length > 0 ? (
            transactions.map((t) => (
              <div key={t.id} className={styles.ledgerCard}>
                <div className={styles.cardTop}>
                  <div className={styles.ledgerInfo}>
                    <div className={styles.ledgerHeader}>
                      <span className={styles.yearTag}>{t.hijri_year} AH</span>
                      {t.trust_name && <span className={styles.trustBadge}>{t.trust_name}</span>}
                    </div>
                    <h3>{t.donor_name}</h3>

                  </div>
                  <div className={styles.cardMenu}>
                    <button onClick={() => handlePrintCard(t)} title="Print Bill">
                      <Printer size={18} />
                    </button>
                    <button onClick={() => setEditModal({ show: true, transaction: JSON.parse(JSON.stringify(t)) })} title="Edit">
                      <Edit3 size={18} />
                    </button>
                    <button onClick={() => handleDelete(t.id)} className={styles.deleteBtn} title="Delete">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className={styles.cardContent}>
                  <div className={styles.tableWrapper}>
                    <table className={styles.billTable}>
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Date</th>
                          <th style={{textAlign: 'right'}}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(t.items || []).map((item, idx) => {
                          // Enhanced lookup to handle potential ID mismatches
                          const cat = categories.find(c => c.id === item.category_id);
                          const displayName = cat ? cat.name : (categories.length > 0 ? 'General' : 'Loading...');
                          
                          return (
                            <tr key={idx}>
                              <td>{displayName}</td>
                              <td>{item.date}</td>
                              <td style={{textAlign: 'right'}}>₹{item.amount.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>


                <div className={styles.cardFooter}>
                  <div className={styles.totalBlock}>
                    <label>Total Collected</label>
                    <div className={styles.grandTotal}>₹{t.total_amount.toFixed(2)}</div>
                  </div>

                  {t.notes && <p className={styles.ledgerNotes}><FileText size={14} /> {t.notes}</p>}
                </div>
              </div>
            ))
          ) : !loading && (
            <div className={styles.emptyState}>No transactions found for these filters.</div>
          )}
        </div>

      </div>



      {hasMore && (
        <div className={styles.loadMoreWrapper}>
          <button className={styles.loadMoreBtn} onClick={loadMore} disabled={loading}>
            {loading ? 'Loading...' : `Load More (${itemsPerRow * 3} per page)`}
          </button>
        </div>
      )}


      {/* Edit Modal */}
      {editModal.show && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>Edit Annual Ledger ({editModal.transaction.hijri_year} AH)</h2>
              <button onClick={() => setEditModal({ show: false, transaction: null })}><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdate} className={styles.modalForm}>
                <div className={styles.modalBody}>
                  <div className={styles.editMetaSection}>
                    <div className={styles.trustGroup}>
                      <label>Trust</label>
                      <select 
                        value={editModal.transaction.trust_id || ''}
                        onChange={(e) => setEditModal({ ...editModal, transaction: { ...editModal.transaction, trust_id: e.target.value } })}
                        className={styles.modalInput}
                      >
                        <option value="">No Trust</option>
                        {trusts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className={styles.yearGroup}>
                      <label>Hijri Year</label>
                      <input 
                        type="text"
                        value={editModal.transaction.hijri_year || ''}
                        onChange={(e) => setEditModal({ ...editModal, transaction: { ...editModal.transaction, hijri_year: e.target.value } })}
                        className={styles.modalInput}
                      />
                    </div>
                  </div>

                  <div className={styles.itemsEditList}>
                    {editModal.transaction.items.map((item, idx) => (
                      <div key={idx} className={styles.editRow}>
                        <select 
                          value={item.category_id}
                          onChange={(e) => updateEditItem(idx, 'category_id', e.target.value)}
                        >
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <input 
                          type="number" 
                          value={item.amount}
                          onChange={(e) => updateEditItem(idx, 'amount', e.target.value)}
                        />
                        <input 
                          type="date" 
                          value={item.date}
                          onChange={(e) => updateEditItem(idx, 'date', e.target.value)}
                        />
                        <button type="button" onClick={() => removeEditItem(idx)} className={styles.removeBtn}>
                            <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={addEditItem} className={styles.addBtn}>
                      <Plus size={16} /> Add Entry
                    </button>
                  </div>
                  
                  <div className={styles.notesEdit}>
                    <label>Admin Notes</label>
                    <input 
                      type="text"
                      placeholder="Add a brief note..."
                      className={styles.modalInput}
                      value={editModal.transaction.notes || ''}
                      onChange={(e) => setEditModal({ ...editModal, transaction: { ...editModal.transaction, notes: e.target.value } })}
                    />
                  </div>

                </div>

                <div className={styles.modalFooter}>
                  <button type="button" onClick={() => setEditModal({ show: false, transaction: null })}>Cancel</button>
                  <button type="submit" className={styles.saveBtn} disabled={loading}>
                    <Save size={18} /> {loading ? 'Saving...' : 'Update Ledger'}
                  </button>
                </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
};

export default History;
