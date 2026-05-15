import React from 'react';
import { Plus, PlusCircle, X, Trash2, ChevronDown } from 'lucide-react';
import DonorSearch from '../../DonorSearch';
import TrustSelect from '../../TrustSelect';
import CategorySelect from '../../CategorySelect';
import styles from './SingleEntry.module.css';

const SingleEntry = ({
  entry,
  dIndex,
  entriesCount,
  categories,
  trusts,
  handleEntryChange,
  handleItemChange,
  handleBulkItemChange,
  clearDonorItems,
  addItemRow,
  removeItemRow,
  removeDonorRow,
  calculateDonorTotal,
  setShowDonorModal,
  handleToggleCollapse
}) => {
  const handleKeyDown = (e, iIndex) => {
    const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
    const isEnter = e.key === 'Enter';

    if (!isArrowKey && !isEnter) return;

    e.preventDefault();
    
    // Find all amount inputs in the current donor card
    const cardElement = e.target.closest(`.${styles.donorCard}`);
    const inputs = Array.from(cardElement.querySelectorAll('input[type="number"]'));
    const currentIndex = inputs.indexOf(e.target);
    
    // Detect current columns dynamically based on layout
    let cols = 1;
    if (inputs.length > 1) {
      const firstTop = inputs[0].getBoundingClientRect().top;
      for (let i = 1; i < inputs.length; i++) {
        // If the top position changes, we found the start of the second row
        if (inputs[i].getBoundingClientRect().top > firstTop + 10) {
          cols = i;
          break;
        }
      }
      // Fallback if all inputs are on one row
      if (cols === 1 && inputs.length > 1 && inputs[1].getBoundingClientRect().top < firstTop + 10) {
        cols = inputs.length;
      }
    }

    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      nextIndex = currentIndex + 1;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = currentIndex - 1;
    } else if (e.key === 'ArrowDown') {
      nextIndex = currentIndex + cols;
    } else if (e.key === 'ArrowUp') {
      nextIndex = currentIndex - cols;
    }

    if (inputs[nextIndex]) {
      inputs[nextIndex].focus();
      inputs[nextIndex].select();
    }
  };

  const handlePaste = (e, iIndex) => {
    const pasteData = e.clipboardData.getData('text');
    // Split by comma, space, tab, or newline
    const values = pasteData.split(/[,\s\n\t]+/).filter(v => v.trim() !== '');
    
    if (values.length > 1) {
      e.preventDefault();
      handleBulkItemChange(dIndex, iIndex, values);
    }
  };
  return (
    <div className={`${styles.donorCard} ${entry.isCollapsed ? styles.collapsed : ''}`}>
      <div 
        className={styles.cardHeader}
        onClick={() => handleToggleCollapse(dIndex)}
      >
        <div className={styles.cardTitle}>
          <div className={styles.index}>{dIndex + 1}</div>
          <h3>Donor Details</h3>
          {entry.isCollapsed && entry.donor_id && (
            <span className={styles.collapsedSummary}>
              • ₹{calculateDonorTotal(dIndex).toLocaleString('en-IN')}
            </span>
          )}
        </div>
        <div className={styles.cardActions}>
          <ChevronDown 
            size={20} 
            className={`${styles.chevron} ${entry.isCollapsed ? '' : styles.open}`} 
          />
          {entriesCount > 1 && (
            <button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                removeDonorRow(dIndex);
              }}
              className={styles.removeDonor}
              title="Remove this donor"
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>
      </div>

      <div className={styles.donorGrid}>
        <div className={styles.inputGroup}>
          <label>
            <span>Donor Name</span>
            <button type="button" onClick={() => setShowDonorModal(true)} className={styles.inlineAddBtn}>
              <Plus size={12} /> New
            </button>
          </label>
          <DonorSearch 
            value={entry.donor_id}
            onChange={(val) => handleEntryChange(dIndex, 'donor_id', val)}
          />
        </div>

        <div className={styles.inputGroup}>
          <label>
            <span>Trust Organization</span>
            <button 
              type="button" 
              onClick={() => handleEntryChange(dIndex, 'showNewTrust', !entry.showNewTrust)} 
              className={styles.inlineAddBtn}
            >
              {entry.showNewTrust ? <X size={12} /> : <Plus size={12} />} 
              {entry.showNewTrust ? ' Select' : ' New'}
            </button>
          </label>
          {entry.showNewTrust ? (
            <input 
              type="text"
              placeholder="Organization Name"
              value={entry.trust_name}
              onChange={(e) => handleEntryChange(dIndex, 'trust_name', e.target.value.toUpperCase())}
              required
              style={{ textTransform: 'uppercase' }}
            />
          ) : (
            <TrustSelect 
              value={entry.trust_id}
              onChange={(val) => handleEntryChange(dIndex, 'trust_id', val)}
            />
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
          <label>Payment Date</label>
          <input 
            type="date" 
            value={entry.payment_date}
            onChange={(e) => handleEntryChange(dIndex, 'payment_date', e.target.value)}
          />
        </div>
      </div>

      {!entry.isCollapsed && (
        <div className={styles.categoriesSection}>
          <div className={styles.itemsList}>
            <div className={styles.worksheetGrid}>
              {entry.items.map((item, iIndex) => {
                const cat = categories.find(c => c.id === item.category_id);

                return (
                  <div key={iIndex} className={styles.worksheetRow}>
                    <div className={styles.categorySelectWrapper}>
                      {cat ? (
                        <span className={styles.categoryLabel}>{cat.name}</span>
                      ) : (
                        <CategorySelect 
                          value={item.category_id}
                          onChange={(val) => handleItemChange(dIndex, iIndex, 'category_id', val)}
                          placeholder="Choose Category"
                          isCompact={true}
                        />
                      )}
                      <button 
                        type="button" 
                        onClick={() => removeItemRow(dIndex, iIndex)}
                        className={styles.removeTiny}
                        title="Remove category"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className={styles.worksheetInputGroup}>
                      <span className={styles.currency}>₹</span>
                      <input 
                        type="number" 
                        placeholder="0.00"
                        value={item.amount}
                        onChange={(e) => handleItemChange(dIndex, iIndex, 'amount', e.target.value)}
                        onPaste={(e) => handlePaste(e, iIndex)}
                        onKeyDown={(e) => handleKeyDown(e, iIndex)}
                      />
                    </div>
                  </div>
                );
              })}
              <div className={styles.categoryActions}>
                <button 
                  type="button" 
                  onClick={() => addItemRow(dIndex)}
                  className={styles.addCustomBtn}
                  title="Add General Category"
                >
                  <PlusCircle size={18} />
                  <span>Add Other Category</span>
                </button>
                <button 
                  type="button" 
                  onClick={() => clearDonorItems(dIndex)}
                  className={styles.clearFieldsBtn}
                  title="Clear all donation amounts"
                >
                  <Trash2 size={18} />
                  <span>Clear Fields</span>
                </button>
              </div>
            </div>
          </div>

          <div className={styles.cardFooter}>
            <div className={styles.totalDisplay}>
              <span>Total:</span>
              <span className={styles.totalAmount}>₹{calculateDonorTotal(dIndex).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SingleEntry;
