# Adding New Field Types & Fixing UI Issues

## 1. How to Add a New Field Type

Adding a new field type to your form builder involves 4 main steps:

### **Step 1: Add to FIELD_TYPES array**

Location: `client/src/pages/FormBuilderPage.jsx` (Lines 5-20)

```javascript
const FIELD_TYPES = [
    { value: 'text', label: 'Short Answer', icon: '📝' },
    { value: 'textarea', label: 'Paragraph', icon: '📄' },
    { value: 'email', label: 'Email', icon: '📧' },
    { value: 'phone', label: 'Phone (10 digits)', icon: '📱' },
    { value: 'multiple_choice', label: 'Multiple Choice', icon: '🔘' },
    { value: 'checkboxes', label: 'Checkboxes', icon: '☑️' },
    { value: 'dropdown', label: 'Dropdown', icon: '📋' },
    { value: 'linear_scale', label: 'Linear Scale', icon: '📊' },
    { value: 'rating', label: 'Rating (Stars)', icon: '⭐' },
    { value: 'date', label: 'Date', icon: '📅' },
    { value: 'time', label: 'Time', icon: '🕐' },
    { value: 'integer', label: 'Number', icon: '🔢' },
    { value: 'branch', label: 'Branch / Stream', icon: '🎯' },
    { value: 'duration', label: 'Duration', icon: '⏱️' },
    { value: 'university_autocomplete', label: 'University Autocomplete', icon: '🎓' },
    // ADD YOUR NEW TYPE HERE:
    { value: 'your_new_type', label: 'Your Field Label', icon: '🔥' },
];
```

**Important:** Each field type object requires:
- `value`: The unique identifier (used in database & code logic)
- `label`: User-friendly display name
- `icon`: Emoji icon for the selector

---

### **Step 2: Add Default Options (if applicable)**

Location: `client/src/pages/FormBuilderPage.jsx` (Lines 23-40)

Only needed if your field type has predefined options (like dropdowns):

```javascript
const DEFAULT_OPTIONS = {
    branch: [
        'Chemical Engineering (CE)',
        'Aerospace/Aeronautical Engineering (AER)',
        // ... more options
    ],
    duration: [
        'January to June',
        'July to December',
        // ... more options
    ],
    // Add your field type here if it has default options:
    your_new_type: ['option1', 'option2', 'option3'],
};
```

---

### **Step 3: Add Rendering Logic in FormSubmitPage.jsx**

Location: `client/src/pages/FormSubmitPage.jsx` (Lines 372+)

Add a new case in the field type rendering switch statement:

```javascript
case 'your_new_type':
    return (
        <input
            type="text"
            className="form-input"
            value={val || ''}
            onChange={(e) => handleChange(field.id, e.target.value)}
            placeholder="Enter your value..."
        />
    );

case 'university_autocomplete':
    return (
        <AutocompleteInput
            value={val}
            onChange={(v) => handleChange(field.id, v)}
            onSelect={(item) => handleUniversitySelect(item, field.id)}
            placeholder="Start typing university name..."
        />
    );
```

---

### **Step 4: Add to Options Display (if needed)**

Location: `client/src/pages/FormBuilderPage.jsx` (Lines 262-290)

If your field type requires users to define options (like dropdown, multiple choice), update this conditional:

```javascript
{['dropdown', 'multiple_choice', 'checkboxes', 'branch', 'duration', 'your_new_type'].includes(field.type) && (
    <div className="form-group">
        <label>Options</label>
        <div className="dropdown-options-list">
            {(field.options_json || []).map((opt, optIdx) => (
                <div key={optIdx} className="dropdown-option-row">
                    <span className="option-number">{optIdx + 1}.</span>
                    <input
                        type="text"
                        className="form-input"
                        value={opt}
                        onChange={(e) => updateOption(index, optIdx, e.target.value)}
                        placeholder={`Option ${optIdx + 1}`}
                    />
                    <button
                        className="btn btn-icon btn-danger-icon"
                        onClick={() => removeOption(index, optIdx)}
                        title="Remove option"
                    >
                        ✕
                    </button>
                </div>
            ))}
            <button className="btn btn-sm btn-secondary" onClick={() => addOption(index)}>
                + Add Option
            </button>
        </div>
    </div>
)}
```

---

### **Step 5: Update Backend (server/routes/fields.js)**

The backend automatically accepts any field type, so if your field type is just text input or simple data, no changes needed.

Location: `server/routes/fields.js` (Lines 28-63)

The field is stored with:
```javascript
await client.query(
    `INSERT INTO form_fields (form_version_id, label, type, options_json, field_order, validation_rules)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
        req.params.versionId,
        f.label || '',
        f.type || 'text',  // Your field type goes here
        JSON.stringify(f.options_json || []),
        i,
        JSON.stringify(f.validation_rules || {}),
    ]
);
```

---

## 2. Fix: Autocomplete Dropdown Hidden Behind Next Field

### **Problem**
The autocomplete dropdown for "University Autocomplete" field appears but gets hidden behind the next form field.

### **Root Cause**
- The dropdown has `z-index: 200` but parent containers with lower `z-index` values and `overflow` properties create a stacking context that prevents it from displaying on top.
- Field containers may have `overflow: hidden` or `overflow: auto` which clips the dropdown.

---

### **Solution 1: Update CSS (Recommended)**

Location: `client/src/index.css` (Lines 1209-1280)

Add these new CSS rules to allow the autocomplete to escape its container:

```css
/* ═══════════════════════════════════════
   AUTOCOMPLETE - FIX OVERFLOW
   ═══════════════════════════════════════ */

.form-field {
  overflow: visible !important;
}

.submit-field {
  overflow: visible !important;
}

.autocomplete-wrapper {
  position: relative;
  z-index: 9999; /* Increased from 10 */
}

.autocomplete-dropdown {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  max-height: 280px;
  overflow-y: auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  z-index: 9999; /* Increased from 200 */
  list-style: none;
  animation: slideDown 0.2s ease;
}
```

---

### **Solution 2: Inline Style Fix (Quick Alternative)**

If you need a quick fix without modifying CSS, wrap the AutocompleteInput in FormSubmitPage.jsx:

Location: `client/src/pages/FormSubmitPage.jsx` (Lines 372-380)

```javascript
case 'university_autocomplete':
    return (
        <div style={{ position: 'relative', zIndex: 1000 }}>
            <AutocompleteInput
                value={val}
                onChange={(v) => handleChange(field.id, v)}
                onSelect={(item) => handleUniversitySelect(item, field.id)}
                placeholder="Start typing university name..."
            />
        </div>
    );
```

---

### **Solution 3: Remove Overflow Hidden**

Check your CSS for any parent containers with the class containing the form fields:

```css
/* Find this pattern and remove overflow: hidden */
.form-container {
  overflow: hidden; /* ❌ REMOVE THIS */
}

/* Or change to: */
.form-container {
  overflow: visible; /* ✅ BETTER */
}
```

---

## Summary

| Task | File | Location |
|------|------|----------|
| Add field type | `FormBuilderPage.jsx` | Lines 5-20 |
| Add default options | `FormBuilderPage.jsx` | Lines 23-40 |
| Render field | `FormSubmitPage.jsx` | Lines 372+ |
| Show options UI | `FormBuilderPage.jsx` | Lines 262-290 |
| Fix dropdown z-index | `index.css` | Lines 1209-1280 |

---

## Example: Adding "Short Answer" Field Type

If you want to add a simple "Short Answer" field:

### FormBuilderPage.jsx (FIELD_TYPES array):
```javascript
{ value: 'short_answer', label: 'Short Answer', icon: '📝' },
```

### FormSubmitPage.jsx (rendering):
```javascript
case 'short_answer':
    return (
        <input
            type="text"
            className="form-input"
            value={val || ''}
            onChange={(e) => handleChange(field.id, e.target.value)}
            placeholder="Enter your answer..."
            maxLength="500"
        />
    );
```

**Done!** No default options needed for this field type.

---

## Validation Rules

Any field type automatically supports validation rules like `required`:

```javascript
const updateValidation = (index, key, value) => {
    const newFields = [...fields];
    newFields[index] = {
        ...newFields[index],
        validation_rules: { ...newFields[index].validation_rules, [key]: value },
    };
    setFields(newFields);
};
```

Your new field type will automatically inherit this validation system.
