import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function SubmissionsPage() {
    const { formId } = useParams();
    const navigate = useNavigate();
    const tableContainerRef = useRef(null);
    const [fields, setFields] = useState([]);
    const [submissions, setSubmissions] = useState([]);
    const [formName, setFormName] = useState('');
    const [loading, setLoading] = useState(true);
    
    // Pagination & Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [pagination, setPagination] = useState({ total: 0, pages: 1 });
    
    // Edit Modal State
    const [editingSubmission, setEditingSubmission] = useState(null);
    const [editValues, setEditValues] = useState({});
    const [savingEdit, setSavingEdit] = useState(false);

    // Audit State
    const [auditLog, setAuditLog] = useState(null); // { submissionId, entries: [] }

    const load = useCallback(async (search = '') => {
        setLoading(true);
        try {
            const res = await api.get(`/forms/${formId}/submissions`, {
                params: { search }
            });
            setFields(res.data.fields);
            setSubmissions(res.data.submissions);
            setPagination(res.data.pagination);
            
            // Get form name if not already set
            if (!formName) {
                const formsRes = await api.get('/forms');
                const form = formsRes.data.forms.find(f => f.id === parseInt(formId));
                if (form) setFormName(form.name);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [formId, formName]);

    useEffect(() => {
        const delayDebounce = setTimeout(() => {
            load(searchTerm);
        }, 500);
        return () => clearTimeout(delayDebounce);
    }, [searchTerm, load]);

    const handleEditClick = (sub) => {
        const initial = {};
        fields.forEach(f => {
            initial[f.id] = getFieldValue(sub, f.id, f.label);
        });
        setEditValues(initial);
        setEditingSubmission(sub);
    };

    const handleEditSave = async () => {
        setSavingEdit(true);
        try {
            await api.put(`/forms/${formId}/submissions/${editingSubmission.id}`, { values: editValues });
            setEditingSubmission(null);
            load(searchTerm);
        } catch {
            alert('Failed to update submission');
        } finally {
            setSavingEdit(false);
        }
    };

    const handleDelete = async (subId) => {
        if (!window.confirm('Delete this entry? It will be removed from this view but kept in the audit trail.')) return;
        try {
            await api.delete(`/forms/${formId}/submissions/${subId}`);
            load(searchTerm);
        } catch {
            alert('Delete failed');
        }
    };

    const fetchAudit = async (subId) => {
        try {
            const res = await api.get(`/forms/${formId}/submissions/${subId}/audit`);
            setAuditLog({ submissionId: subId, entries: res.data.audit });
        } catch {
            alert('Failed to fetch audit history');
        }
    };

    const getFieldValue = (submission, fieldId, fieldLabel) => {
        // Fallback to data_json (label-based) if field_id lookup fails
        // This is crucial for version-agnostic display (e.g., duplicated forms)
        if (submission.data_json && submission.data_json[fieldLabel]) {
            return submission.data_json[fieldLabel];
        }
        if (!submission.values) return '';
        const val = submission.values.find(v => v.field_id === fieldId);
        return val ? val.value : '';
    };

    const handleExport = async () => {
        try {
            // Using params object to ensure proper encoding of search term
            const res = await api.get(`/export/${formId}`, { 
                params: { search: searchTerm },
                responseType: 'blob' 
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.download = `${formName.replace(/[^a-zA-Z0-9]/g, '_')}_submissions.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            alert('Export failed');
        }
    };

    return (
        <div className="submissions-page">
            <header className="submissions-header">
                <div className="header-left">
                    <button className="btn btn-ghost" onClick={() => navigate('/')}>← Back</button>
                    <h1>📊 {formName}</h1>
                </div>
                
                <div className="header-center flex-1">
                    <div className="search-container">
                        <input 
                            type="text" 
                            className="search-input" 
                            placeholder="🔍 Server-side search (any value)..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="header-right">
                    <span className="badge badge-count">{pagination.total} entries</span>
                    <button className="btn btn-primary" onClick={handleExport}>📥 Export All</button>
                </div>
            </header>

            {loading && submissions.length === 0 ? (
                <div className="loading-screen"><div className="spinner"></div></div>
            ) : submissions.length === 0 ? (
                <div className="empty-state glass-card"><h2>No entries found</h2></div>
            ) : (
                <>
                    <div className="table-container glass-card" ref={tableContainerRef}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th className="sticky-col first-col">Actions</th>
                                    <th>ID</th>
                                    <th>Submitted At</th>
                                    {fields.map(f => <th key={f.id}>{f.label}</th>)}
                                    <th>Edit Logs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {submissions.map((sub) => (
                                    <tr key={sub.id}>
                                        <td className="sticky-col first-col">
                                            <div className="action-group">
                                                <button className="btn btn-icon btn-sm" onClick={() => handleEditClick(sub)} title="Edit">✏️</button>
                                                <button className="btn btn-icon btn-sm btn-danger-icon" onClick={() => handleDelete(sub.id)} title="Delete">🗑️</button>
                                            </div>
                                        </td>
                                        <td>{sub.id}</td>
                                        <td>{new Date(sub.submitted_at).toLocaleString()}</td>
                                        {fields.map(f => {
                                            const val = getFieldValue(sub, f.id, f.label);
                                            const isFolder = val && val.startsWith('/uploads/batch_');
                                            return (
                                                <td key={f.id}>
                                                    {isFolder ? (
                                                        <a 
                                                            href={`/shared/files?path=${encodeURIComponent(val)}`} 
                                                            target="_blank" 
                                                            rel="noreferrer"
                                                            className="btn btn-ghost btn-sm"
                                                        >
                                                            📂 View Files
                                                        </a>
                                                    ) : val}
                                                </td>
                                            );
                                        })}
                                        <td>
                                            {sub.updated_at ? (
                                                <button className="btn btn-ghost btn-sm" onClick={() => fetchAudit(sub.id)}>
                                                    🕒 History ({sub.updated_by_username})
                                                </button>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Edit Modal */}
            {editingSubmission && (
                <div className="modal-overlay" onClick={() => setEditingSubmission(null)}>
                    <div className="modal glass-card modal-fixed-height" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>✏️ Edit Response #{editingSubmission.id}</h2>
                            <p className="modal-subtitle">Directly modifying entry data</p>
                        </div>
                        <div className="modal-body scrollable-content">
                            {fields.map(f => (
                                <div key={f.id} className="form-group">
                                    <label>{f.label}</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={editValues[f.id] || ''}
                                        onChange={(e) => setEditValues({ ...editValues, [f.id]: e.target.value })}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="modal-actions-sticky">
                            <button className="btn btn-ghost" onClick={() => setEditingSubmission(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleEditSave} disabled={savingEdit}>
                                {savingEdit ? <span className="spinner-sm"></span> : '💾 Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Audit Modal */}
            {auditLog && (
                <div className="modal-overlay" onClick={() => setAuditLog(null)}>
                    <div className="modal glass-card modal-fixed-height audit-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>🕒 History for Response #{auditLog.submissionId}</h2>
                            <p className="modal-subtitle">Showing all previous versions before edits</p>
                        </div>
                        <div className="modal-body scrollable-content">
                            {auditLog.entries.length === 0 ? (
                                <p>No audit entries found.</p>
                            ) : (
                                <div className="audit-timeline">
                                    {auditLog.entries.map((entry, idx) => (
                                        <div key={entry.id} className="audit-entry glass-card">
                                            <div className="audit-entry-header">
                                                <span className="audit-badge">Snapshot #{auditLog.entries.length - idx}</span>
                                                <span className="audit-meta">
                                                    Changed by <strong>{entry.changed_by_username}</strong> on {new Date(entry.changed_at).toLocaleString()}
                                                </span>
                                            </div>
                                            <div className="audit-values">
                                                {fields.map(f => (
                                                    <div key={f.id} className="audit-value-item">
                                                        <span className="audit-label">{f.label}:</span>
                                                        <span className="audit-value">{entry.old_values_json[f.id] || '(empty)'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="modal-actions-sticky">
                            <button className="btn btn-primary" onClick={() => setAuditLog(null)}>Close History</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
