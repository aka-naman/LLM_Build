# 🧮 CGPA Field Implementation Details

**Target File:** `client/src/pages/FormSubmitPage.jsx`

This document tracks the exact changes made to the codebase to transition from a static preset-based CGPA converter to a dynamic, formula-driven system.

---

## 1. Constant Definitions
**File:** `client/src/pages/FormSubmitPage.jsx`

**Old:**
```javascript
const CGPA_PRESETS = [
    { id: '10_scale', label: '10 Scale (9.5)', scale: 10, factor: 9.5 },
    { id: '4_scale', label: '4 Scale (3.8)', scale: 4, factor: 3.8 },
    { id: 'custom', label: 'Custom Rule', scale: 10, factor: 9.5 }
];
```

**New:**
```javascript
const CGPA_PRESETS = [
    { id: '10', label: '10 Scale', scale: 10 },
    { id: '7', label: '7 Scale', scale: 7 },
    { id: '4', label: '4 Scale', scale: 4 },
    { id: 'other', label: 'Other Scale', scale: '' }
];
```

---

## 2. Initialization Logic (inside `useEffect`)
**Old:**
```javascript
if (f.type === 'cgpa_converter') {
    initialOthers[f.id] = { cgpa: '', presetId: '10_scale', scale: 10, factor: 9.5 };
}
```

**New:**
```javascript
if (f.type === 'cgpa_converter') {
    initialOthers[f.id] = { 
        cgpa: '', 
        presetId: '10', 
        scale: 10, 
        factorType: 'auto', 
        factor: 9.5 
    };
}
```

---

## 3. Render & Calculation Logic (inside `renderField`)
**Major Changes:**
1.  Introduced `factorType` to toggle between `auto` and `manual`.
2.  Implemented the formula `95 / Max CGPA` for the auto-calculated factor.
3.  Simplified the final percentage formula to `Obtained CGPA * Factor`.
4.  Added conditional UI for "Custom Max CGPA" and "Manual Factor".

**New Implementation:**
```javascript
case 'cgpa_converter': {
    const data = otherValues[field.id] || { 
        cgpa: '', 
        presetId: '10', 
        scale: 10, 
        factorType: 'auto', 
        factor: 9.5 
    };
    
    const updateCgpa = (updates) => {
        const next = { ...data, ...updates };
        
        // 1. Handle Max CGPA changes
        if ('presetId' in updates) {
            const preset = CGPA_PRESETS.find(p => p.id === updates.presetId);
            next.scale = preset.scale;
        }

        // 2. Handle Conversion Factor logic
        const scaleNum = parseFloat(next.scale);
        if (next.factorType === 'auto' && !isNaN(scaleNum) && scaleNum !== 0) {
            next.factor = (95 / scaleNum).toFixed(4);
        }

        setOtherValues(p => ({ ...p, [field.id]: next }));
        
        const obtained = parseFloat(next.cgpa);
        const factor = parseFloat(next.factor);

        if (!isNaN(obtained) && !isNaN(factor)) {
            const result = obtained * factor;
            handleChange(field.id, `${result.toFixed(2)}% (CGPA: ${obtained}, Scale: ${next.scale}, Factor: ${factor})`);
        } else {
            handleChange(field.id, '');
        }
    };

    return (
        <div className="cgpa-composite">
            <div className="field-row">
                <div className="flex-1">
                    <label className="sub-label">Obtained CGPA</label>
                    <input 
                        type="number" 
                        className="form-input" 
                        placeholder="e.g. 8.5" 
                        value={data.cgpa} 
                        onChange={(e) => updateCgpa({ cgpa: e.target.value })} 
                        step="0.01" 
                    />
                </div>
                <div className="flex-1">
                    <label className="sub-label">Max CGPA</label>
                    <select 
                        className="form-input" 
                        value={data.presetId} 
                        onChange={(e) => updateCgpa({ presetId: e.target.value })}
                    >
                        {CGPA_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                </div>
            </div>

            <div className="field-row">
                {data.presetId === 'other' && (
                    <div className="flex-1">
                        <label className="sub-label">Custom Max CGPA</label>
                        <input 
                            type="number" 
                            className="form-input" 
                            placeholder="e.g. 5"
                            value={data.scale} 
                            onChange={(e) => updateCgpa({ scale: e.target.value })} 
                        />
                    </div>
                )}
                <div className="flex-1">
                    <label className="sub-label">Conversion Factor</label>
                    <select 
                        className="form-input" 
                        value={data.factorType}
                        onChange={(e) => updateCgpa({ factorType: e.target.value })}
                    >
                        <option value="auto">Auto ({(!isNaN(parseFloat(data.scale)) && parseFloat(data.scale) !== 0) ? (95 / parseFloat(data.scale)).toFixed(2) : '?'})</option>
                        <option value="manual">Other (Manual)</option>
                    </select>
                </div>
                {data.factorType === 'manual' && (
                    <div className="flex-1">
                        <label className="sub-label">Manual Factor</label>
                        <input 
                            type="number" 
                            className="form-input" 
                            placeholder="e.g. 10"
                            value={data.factor} 
                            onChange={(e) => updateCgpa({ factor: e.target.value })} 
                            step="0.0001"
                        />
                    </div>
                )}
            </div>

            {val && (
                <div className="cgpa-result">
                    Calculated Percentage: <strong>{val.split('%')[0]}%</strong>
                </div>
            )}
        </div>
    );
}
```
