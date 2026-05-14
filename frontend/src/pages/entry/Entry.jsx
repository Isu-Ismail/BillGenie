import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  UserPlus, 
  Save, 
  PlusCircle, 
  AlertCircle,
  Users,
  User,
  ChevronDown,
  X,
  Upload,
  FileJson,
  MapPin,
  Phone,
  CheckCircle,
  Search
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import styles from './Entry.module.css';
import DonorSearch from './DonorSearch';


const Entry = () => {
  const [isBatchMode, setIsBatchMode] = useState(false);

  const [trusts, setTrusts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [groupedCategories, setGroupedCategories] = useState({ assigned: [], others: [] });
  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Modal states
  const [showDonorModal, setShowDonorModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [directJson, setDirectJson] = useState('');
  const fileInputRef = useRef(null);

  const handleProcessDirectJson = async () => {
    try {
      const json = JSON.parse(directJson);
      const donorsToImport = Array.isArray(json) ? json : [json];
      
      setLoading(true);
      const response = await fetch(API_ENDPOINTS.DONORS.BATCH_CREATE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(donorsToImport)
      });

      if (response.ok) {
        await fetchData(); // Refresh donors list
        setShowImportModal(false);
        setDirectJson('');
        setMessage({ type: 'success', text: `Successfully imported ${donorsToImport.length} donors!` });
      } else {
        throw new Error('Failed to import donors');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Invalid JSON format: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  // New Donor state
  const [newDonor, setNewDonor] = useState({
    name: '',
    gender: 'M',
    mobile: '',
    door_no: '',
    street: ''
  });

  // Initial state for a single entry
  const emptyItem = { category_id: '', amount: '' };
  const emptyDonorEntry = {
    donor_id: '',
    trust_id: '',
    hijri_year: '',
    payment_date: new Date().toISOString().split('T')[0],
    notes: '',
    items: [{ ...emptyItem }],
    showNewTrust: false,
    trust_name: ''
  };


  const [entries, setEntries] = useState([{ ...emptyDonorEntry }]);

  // Fetch real data from API
  useEffect(() => {
    fetchData();
  }, []);

  const fetchGroupedCategories = async (trustId, allCats = categories) => {
    if (!trustId) {
      setGroupedCategories({ assigned: [], others: allCats });
      return;
    }
    try {
      const res = await fetch(`http://localhost:8000/api/categories/by-trust/${trustId}`);
      if (res.ok) {
        setGroupedCategories(await res.json());
      }
    } catch (err) { console.error(err); }
  };

  const fetchData = async () => {
    try {
      const [catRes, trustRes] = await Promise.all([
        fetch('http://localhost:8000/api/categories/'),
        fetch('http://localhost:8000/api/trusts/')
      ]);
      
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData);
        setGroupedCategories({ assigned: [], others: catData });
      }
      if (trustRes.ok) {
        const trustData = await trustRes.json();
        setTrusts(trustData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setMessage({ type: 'error', text: 'Failed to load categories/trusts' });
    }
  };


  const handleCreateDonor = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/donors/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDonor)
      });
      if (response.ok) {
        const created = await response.json();
        setDonors([...donors, created]);
        setShowDonorModal(false);
        setNewDonor({ name: '', gender: 'M', mobile: '', door_no: '', street: '' });
        setMessage({ type: 'success', text: `Donor ${created.name} added successfully!` });
      } else {
        throw new Error('Failed to create donor');
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const downloadExcelTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Import Template');

    // Setup Columns matching Report Export + new features
    const columns = [
      { header: 'DONOR NAME', key: 'donor_name', width: 25 },
      { header: 'DOOR NO', key: 'door_no', width: 12 },
      { header: 'STREET', key: 'street', width: 20 },
      { header: 'MOBILE', key: 'mobile', width: 15 },
      { header: 'GENDER', key: 'gender', width: 10 },
      { header: 'HIJRI YEAR', key: 'hijri_year', width: 12 },
      { header: 'TRUST NAME', key: 'trust_name', width: 25 },
      { header: 'TOTAL', key: 'total', width: 15 },
    ];

    categories.forEach(cat => {
      columns.push({ header: cat.name.toUpperCase(), key: cat.id, width: 15 });
    });

    worksheet.columns = columns;

    // Add TOTALS Row (as requested, same as report export)
    const totalsData = {
      donor_name: 'TOTALS',
      door_no: '',
      street: '',
      mobile: '',
      gender: '',
      hijri_year: '',
      trust_name: '',
      total: 0
    };

    categories.forEach(cat => {
      totalsData[cat.id] = 0;
    });
    worksheet.addRow(totalsData);

    // Style Header
    const headerRow = worksheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Generate and Save
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `BillGenie_Import_Template_${new Date().getFullYear()}.xlsx`);
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file || trusts.length === 0) return;

    setLoading(true);
    setMessage({ type: '', text: '' });
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('trust_id', entries[0].trust_id || trusts[0].id);
    formData.append('hijri_year', entries[0].hijri_year || '1446');

    try {
      const response = await fetch('http://localhost:8000/api/new-entry/import-excel', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (response.ok) {
        setMessage({ type: 'success', text: data.message });
        setShowImportModal(false);
      } else {
        throw new Error(data.detail || 'Import failed');
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportJSON = async (e) => {

    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const donorsToImport = Array.isArray(json) ? json : [json];
        
        setLoading(true);
        const response = await fetch('http://localhost:8000/api/donors/batch-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(donorsToImport)
        });

        if (response.ok) {
          await fetchData(); // Refresh donors list
          setShowImportModal(false);
          setMessage({ type: 'success', text: `Successfully imported ${donorsToImport.length} donors!` });
        } else {
          throw new Error('Failed to import donors');
        }
      } catch (error) {
        setMessage({ type: 'error', text: 'Invalid JSON file or import failed: ' + error.message });
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const addDonorRow = () => {
    setEntries([...entries, { ...emptyDonorEntry, items: [{ ...emptyItem }] }]);
  };

  const removeDonorRow = (index) => {
    if (entries.length > 1) {
      const newEntries = entries.filter((_, i) => i !== index);
      setEntries(newEntries);
    }
  };

  const addItemRow = (donorIndex) => {
    const newEntries = [...entries];
    newEntries[donorIndex].items.push({ ...emptyItem });
    setEntries(newEntries);
  };

  const removeItemRow = (donorIndex, itemIndex) => {
    const newEntries = [...entries];
    if (newEntries[donorIndex].items.length > 1) {
      newEntries[donorIndex].items = newEntries[donorIndex].items.filter((_, i) => i !== itemIndex);
      setEntries(newEntries);
    }
  };

  const handleEntryChange = (donorIndex, field, value) => {
    const newEntries = [...entries];
    newEntries[donorIndex][field] = value;
    
    // If trust selection changes, refresh categories for the entire form
    if (field === 'trust_id') {
      fetchGroupedCategories(value);
    } else if (field === 'showNewTrust') {
      fetchGroupedCategories(null);
    }
    
    setEntries(newEntries);
  };

  const handleItemChange = (donorIndex, itemIndex, field, value) => {
    const newEntries = [...entries];
    newEntries[donorIndex].items[itemIndex][field] = value;
    setEntries(newEntries);
  };

  const calculateDonorTotal = (donorIndex) => {
    return entries[donorIndex].items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      for (const entry of entries) {
        const payload = {
          ...entry,
          trust_id: entry.showNewTrust ? '' : entry.trust_id,
          trust_name: entry.showNewTrust ? entry.trust_name : '',
          total_amount: entry.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
          items: entry.items.filter(item => item.category_id && item.amount)
        };


        const response = await fetch('http://localhost:8000/api/new-entry/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Failed to save entry');
      }

      setMessage({ type: 'success', text: 'All entries saved successfully!' });
      setEntries([{ ...emptyDonorEntry }]);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Create New Entry</h1>
          <p className={styles.subtitle}>Add donation records for one or multiple donors</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryBtn} onClick={() => setShowImportModal(true)}>
            <FileJson size={18} /> Import Donors
          </button>
          <div className={styles.modeToggle}>
            <button 
              className={`${styles.toggleBtn} ${!isBatchMode ? styles.activeMode : ''}`}
              onClick={() => setIsBatchMode(false)}
            >
              <User size={18} /> Single
            </button>
            <button 
              className={`${styles.toggleBtn} ${isBatchMode ? styles.activeMode : ''}`}
              onClick={() => setIsBatchMode(true)}
            >
              <Users size={18} /> Batch
            </button>
          </div>
        </div>
      </header>

      {message.text && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span>{message.text}</span>
          <button onClick={() => setMessage({ type: '', text: '' })} className={styles.closeMsg}>
            <X size={16} />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.entriesList}>
          {entries.map((entry, dIndex) => (
            <div key={dIndex} className={styles.donorCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <span className={styles.index}>{dIndex + 1}</span>
                  <h3>Donor Information</h3>
                </div>
                <div className={styles.cardActions}>
                  {isBatchMode && entries.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => removeDonorRow(dIndex)}
                      className={styles.removeDonor}
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.donorGrid}>
                <div className={styles.inputGroup}>
                  <label className={styles.labelWithAction}>
                    Donor Name
                    <button type="button" onClick={() => setShowDonorModal(true)} className={styles.inlineAddBtn}>
                      <Plus size={14} /> New
                    </button>
                  </label>
                  <DonorSearch 
                    value={entry.donor_id}
                    onChange={(val) => handleEntryChange(dIndex, 'donor_id', val)}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.labelWithAction}>
                    Association Trust
                    <button 
                      type="button" 
                      onClick={() => handleEntryChange(dIndex, 'showNewTrust', !entry.showNewTrust)} 
                      className={styles.inlineAddBtn}
                    >
                      {entry.showNewTrust ? <X size={14} /> : <Plus size={14} />} 
                      {entry.showNewTrust ? ' Select Existing' : ' New'}
                    </button>
                  </label>
                  {entry.showNewTrust ? (
                    <input 
                      type="text"
                      placeholder="Enter new trust name"
                      value={entry.trust_name}
                      onChange={(e) => handleEntryChange(dIndex, 'trust_name', e.target.value)}
                      className={styles.trustInput}
                      required
                    />
                  ) : (
                    <select 
                      value={entry.trust_id}
                      onChange={(e) => handleEntryChange(dIndex, 'trust_id', e.target.value)}
                      className={styles.trustSelect}
                      required
                    >
                      <option value="">Select Trust</option>
                      {trusts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                </div>

                <div className={styles.inputGroup}>
                  <label>Hijri Year</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 1446"
                    className={styles.yearInput}
                    value={entry.hijri_year}
                    onChange={(e) => handleEntryChange(dIndex, 'hijri_year', e.target.value)}
                  />


                </div>
                <div className={styles.inputGroup}>
                  <label>Date</label>
                  <input 
                    type="date" 
                    value={entry.payment_date}
                    onChange={(e) => handleEntryChange(dIndex, 'payment_date', e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.categoriesSection}>
                <div className={styles.itemsList}>
                  {entry.items.map((item, iIndex) => (
                    <div key={iIndex} className={styles.itemRow}>
                      <div className={styles.inputGroup}>
                        <select 
                          value={item.category_id}
                          onChange={(e) => handleItemChange(dIndex, iIndex, 'category_id', e.target.value)}
                          required
                        >
                          <option value="">Category</option>
                          {groupedCategories.assigned?.length > 0 && (
                            <optgroup label="--- ASSIGNED TO THIS TRUST ---">
                              {groupedCategories.assigned.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </optgroup>
                          )}
                          <optgroup label={groupedCategories.assigned?.length > 0 ? "--- GENERAL CATEGORIES ---" : "--- ALL CATEGORIES ---"}>
                            {groupedCategories.others?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </optgroup>
                        </select>
                      </div>
                      <div className={styles.inputGroup}>
                        <input 
                          type="number" 
                          placeholder="Amount"
                          value={item.amount}
                          onChange={(e) => handleItemChange(dIndex, iIndex, 'amount', e.target.value)}
                          required
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={() => removeItemRow(dIndex, iIndex)}
                        className={styles.removeItem}
                        disabled={entry.items.length === 1}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button 
                    type="button" 
                    onClick={() => addItemRow(dIndex)}
                    className={styles.addItemBtn}
                    style={{ alignSelf: 'flex-start', marginTop: '10px' }}
                  >
                    <Plus size={16} /> Add Category
                  </button>
                </div>


                <div className={styles.cardFooter}>
                  <div className={styles.totalDisplay}>
                    <span>Total:</span>
                    <span className={styles.totalAmount}>₹{calculateDonorTotal(dIndex).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.formActions}>
          {isBatchMode && (
            <button type="button" onClick={addDonorRow} className={styles.addBatchBtn}>
              <UserPlus size={20} /> Add Another Donor
            </button>
          )}
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Saving...' : (
              <>
                <Save size={20} /> Save All Entries
              </>
            )}
          </button>
        </div>
      </form>

      {/* New Donor Modal */}
      {showDonorModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>Add New Donor</h2>
              <button onClick={() => setShowDonorModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateDonor} className={styles.modalForm}>
              <div className={styles.inputGroup}>
                <label>Full Name</label>
                <input 
                  type="text" 
                  value={newDonor.name}
                  onChange={(e) => setNewDonor({...newDonor, name: e.target.value})}
                  placeholder="Enter donor's full name"
                  required
                />
              </div>
              <div className={styles.modalGrid}>
                <div className={styles.inputGroup}>
                  <label>Gender</label>
                  <select 
                    value={newDonor.gender}
                    onChange={(e) => setNewDonor({...newDonor, gender: e.target.value})}
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>
                <div className={styles.inputGroup}>
                  <label>Mobile Number</label>
                  <input 
                    type="tel" 
                    value={newDonor.mobile}
                    onChange={(e) => setNewDonor({...newDonor, mobile: e.target.value})}
                    placeholder="+91 ..."
                  />
                </div>
              </div>
              <div className={styles.modalGrid}>
                <div className={styles.inputGroup}>
                  <label>Door No.</label>
                  <input 
                    type="text" 
                    value={newDonor.door_no}
                    onChange={(e) => setNewDonor({...newDonor, door_no: e.target.value})}
                    placeholder="12/A"
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label>Street / Area</label>
                  <input 
                    type="text" 
                    value={newDonor.street}
                    onChange={(e) => setNewDonor({...newDonor, street: e.target.value})}
                    placeholder="Main Street"
                  />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button type="button" onClick={() => setShowDonorModal(false)} className={styles.cancelBtn}>Cancel</button>
                <button type="submit" className={styles.confirmBtn} disabled={loading}>
                  {loading ? 'Creating...' : 'Create Donor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <Upload size={24} className={styles.modalIcon} />
                <h2>Bulk Import Transactions</h2>
              </div>
              <button onClick={() => setShowImportModal(false)} className={styles.closeBtn}><X size={20} /></button>
            </div>
            
            <div className={styles.importContent}>
              <div className={styles.stepCard}>
                <div className={styles.stepNumber}>1</div>
                <div className={styles.stepText}>
                  <h4>Download Template</h4>
                  <p>Get the correctly formatted Excel file with all your donation categories.</p>
                </div>
                <button onClick={downloadExcelTemplate} className={styles.templateBtn}>
                  Download Excel Template
                </button>
              </div>

              <div className={styles.stepCard}>
                <div className={styles.stepNumber}>2</div>
                <div className={styles.stepText}>
                  <h4>Upload Spreadsheet</h4>
                  <p>Fill in the donor details and amounts, then upload it here.</p>
                </div>
                <div 
                  className={styles.excelDropZone}
                  onClick={() => fileInputRef.current.click()}
                >
                  <Upload size={28} />
                  <span>{loading ? 'Processing...' : 'Click to select Excel file'}</span>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImportExcel} 
                    style={{ display: 'none' }} 
                    accept=".xlsx, .xls"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className={styles.importAlert}>
                <AlertCircle size={18} />
                <p>Ensure the <b>Trust Organization</b> and <b>Hijri Year</b> selected on the main form are correct before importing.</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Entry;
