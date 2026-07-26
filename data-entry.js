// AUREO — MÓDULO: INGRESO DE DATOS (materiales, proveedores, ubicaciones, movimientos, tránsito, rótulos)

// ==========================================================================
//   MÓDULO: INGRESO DE DATOS
// ==========================================================================

const DE_SUBS = [
    { id: 'materiales', label: 'Materiales', icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' },
    { id: 'proveedores', label: 'Proveedores', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
    { id: 'ubicaciones', label: 'Ubicaciones', icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>' },
    { id: 'movimientos', label: 'Movimientos', icon: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>' },
    { id: 'transito', label: 'En Tránsito', icon: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>' },
    { id: 'rotulos', label: 'Historial de Rótulos', icon: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>' }
];

let activeDataEntrySub = null;

function renderDataEntry() {
    const tabsEl = document.getElementById('dataentry-tabs');

    // Construir tabs si no existen aún
    if (tabsEl.children.length === 0) {
        DE_SUBS.forEach(sub => {
            const btn = document.createElement('button');
            btn.className = 'dataentry-tab-btn';
            btn.dataset.sub = sub.id;
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${sub.icon}</svg>${sub.label}`;
            btn.onclick = () => switchDataEntrySub(sub.id);
            tabsEl.appendChild(btn);
        });
    }

    const defaultSub = activeDataEntrySub || DE_SUBS[0].id;
    switchDataEntrySub(defaultSub);
}

function switchDataEntrySub(subId) {
    activeDataEntrySub = subId;
    document.querySelectorAll('.dataentry-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sub === subId);
    });
    const renderers = {
        materiales: renderDE_Materiales,
        proveedores: renderDE_Proveedores,
        ubicaciones: renderDE_Ubicaciones,
        movimientos: renderDE_Movimientos,
        transito: renderDE_Transito,
        rotulos: renderDE_Rotulos
    };
    if (renderers[subId]) renderers[subId]();
}

// --------------------------------------------------------------------------
//   APARTADO: MATERIALES
// --------------------------------------------------------------------------
let _deMatEditId = null;
let _deMatSearch = '';
let _deMatImportRows = [];

let _deProvEditId = null;
let _deProvSearch = '';
let _deProvImportRows = [];

let _deUbicEditId = null;
let _deUbicSearch = '';
let _deUbicImportRows = [];

let _deMovEditId = null;
let _deMovFilters = { tipo: 'todos', estado: 'todos', bodega: 'todas', zona: 'todas', desde: '', hasta: '' };

function renderDE_Materiales() {
    const isEdit = _deMatEditId !== null;
    const editing = isEdit ? state.materials.find(m => m.id === _deMatEditId) : null;
    const nextId = 'MAT-' + String(state.materials.length + 1).padStart(4, '0');

    const el = document.getElementById('dataentry-content');
    el.innerHTML = `
    <div class="dataentry-panel">
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            ${isEdit ? 'Editar Material' : 'Registrar Material'}
          </span>
          ${isEdit ? `<button type="button" class="btn btn-secondary btn-sm" onclick="cancelDE_MatEdit()">Cancelar edición</button>` : ''}
        </div>
        <form onsubmit="saveDE_Material(event)">
          <input type="hidden" id="de-mat-edit-id" value="${isEdit ? editing.id : ''}">
          <div class="form-row" style="grid-template-columns: 140px 1fr 1fr;">
            <div class="form-group">
              <label class="form-label">ID</label>
              <input type="text" class="form-input" id="de-mat-id"
                value="${isEdit ? editing.id : nextId}" readonly
                style="opacity:.5;cursor:not-allowed;">
            </div>
            <div class="form-group">
              <label class="form-label">Código</label>
              <input type="text" class="form-input" id="de-mat-code" required
                placeholder="Ej: COD-0045"
                value="${isEdit ? editing.code : ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Descripción</label>
              <input type="text" class="form-input" id="de-mat-desc" required
                placeholder="Ej: Tornillo autoperforante 1/2&quot;"
                value="${isEdit ? editing.desc : ''}">
            </div>
          </div>
          <div class="form-row" style="grid-template-columns: 1fr 1fr 1fr;">
            <div class="form-group">
              <label class="form-label">Unidad</label>
              <input type="number" class="form-input" id="de-mat-unit" required
                min="0" placeholder="0"
                value="${isEdit ? editing.unit : ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Unidad de Medida</label>
              <select class="form-select" id="de-mat-uom">
                ${['UN', 'KG', 'MT', 'LT', 'M²', 'M³', 'CM', 'MM', 'GL', 'TON', 'GR', 'ML', 'PKT', 'JGO']
            .map(u => `<option${isEdit && editing.uom === u ? ' selected' : ''}>${u}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Categoría</label>
              <select class="form-select" id="de-mat-category">
                ${['Herramientas Eléctricas', 'Herramientas Manuales', 'Consumibles y EPP', 'Fijaciones y Anclajes', 'Maquinaria Pesada', 'Materiales de Construcción', 'Pinturas y Acabados', 'Eléctrico y Cableado', 'Plomería', 'Otros']
            .map(c => `<option${isEdit && editing.category === c ? ' selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:.75rem;margin-top:.5rem;">
            ${isEdit ? `<button type="button" class="btn btn-secondary" onclick="cancelDE_MatEdit()">Cancelar</button>` : ''}
            <button type="submit" class="btn btn-primary">
              ${isEdit ? 'Actualizar Material' : 'Agregar Material'}
            </button>
          </div>
        </form>
      </div>

      <!-- IMPORTAR EXCEL -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            Importar desde Excel
          </span>
          <button class="btn btn-secondary btn-sm" onclick="downloadDE_MatTemplate()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Descargar plantilla
          </button>
        </div>
        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1.25rem;">
          El archivo debe tener las columnas: <strong style="color:var(--text-secondary);">Codigo · Descripcion · Unidad · UnidadMedida · Categoria</strong> (primera fila = encabezados).
        </p>
        <div class="de-import-drop" id="de-mat-dropzone" onclick="document.getElementById('de-mat-file').click()"
          ondragover="event.preventDefault();this.classList.add('drag-over')"
          ondragleave="this.classList.remove('drag-over')"
          ondrop="this.classList.remove('drag-over');handleDE_MatFileDrop(event)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>Arrastra tu archivo aquí o <strong>haz clic para seleccionar</strong></span>
          <span style="font-size:.78rem;color:var(--text-muted);">Formatos aceptados: .xlsx · .xls · .csv</span>
          <input type="file" id="de-mat-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleDE_MatFileInput(this)">
        </div>
        <div id="de-mat-import-preview" style="margin-top:1.25rem;"></div>
      </div>

      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">Materiales Registrados</span>
          <span class="badge badge-info" id="de-mat-count">${state.materials.length} registros</span>
        </div>
        <div class="input-wrapper" style="margin-bottom:1.25rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="form-input" id="de-mat-search"
            placeholder="Buscar por ID, código, descripción, unidad de medida o categoría..."
            value="${_deMatSearch}"
            oninput="filterDE_Mat(this.value)">
        </div>
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Código</th>
                <th>Descripción</th>
                <th>Unidad</th>
                <th>U. de Medida</th>
                <th>Categoría</th>
                <th style="text-align:center;">Acciones</th>
              </tr>
            </thead>
            <tbody id="de-mat-tbody">
              ${buildDE_MatRows(state.materials)}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function saveDE_Material(e) {
    e.preventDefault();
    const editId = document.getElementById('de-mat-edit-id').value;
    const mat = {
        id: editId || 'MAT-' + String(state.materials.length + 1).padStart(4, '0'),
        code: document.getElementById('de-mat-code').value.trim(),
        desc: document.getElementById('de-mat-desc').value.trim(),
        unit: document.getElementById('de-mat-unit').value,
        uom: document.getElementById('de-mat-uom').value,
        category: document.getElementById('de-mat-category').value
    };
    if (editId) {
        const idx = state.materials.findIndex(m => m.id === editId);
        if (idx !== -1) state.materials[idx] = mat;
        triggerToast('success', `Material "${mat.desc}" actualizado.`);
        _deMatEditId = null;
    } else {
        state.materials.push(mat);
        triggerToast('success', `Material "${mat.desc}" registrado.`);
    }
    saveDEKey('materials');
    renderDE_Materiales();
}

function editDE_Material(id) {
    _deMatEditId = id;
    renderDE_Materiales();
    document.getElementById('dataentry-content').scrollIntoView({ behavior: 'smooth' });
}

function cancelDE_MatEdit() {
    _deMatEditId = null;
    renderDE_Materiales();
}

function deleteDE_Material(id) {
    const mat = state.materials.find(m => m.id === id);
    if (!mat) return;
    if (!confirm(`¿Eliminar el material "${mat.desc}" (${mat.code})?`)) return;
    state.materials = state.materials.filter(m => m.id !== id);
    saveDEKey('materials');
    if (_deMatEditId === id) _deMatEditId = null;
    renderDE_Materiales();
}

function buildDE_MatRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">Sin materiales registrados.</td></tr>`;
    }
    return list.map(m => `
        <tr>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.8rem;color:var(--accent-gold);font-weight:700;">${m.id}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.85rem;font-weight:600;">${m.code}</td>
          <td><span class="product-name">${m.desc}</span></td>
          <td style="text-align:center;font-weight:600;">${m.unit}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.8rem;">
            <span class="badge badge-info">${m.uom}</span>
          </td>
          <td>${m.category}</td>
          <td style="text-align:center;">
            <div style="display:inline-flex;gap:.5rem;">
              <button class="btn btn-secondary btn-icon-only" onclick="editDE_Material('${m.id}')" title="Editar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
              </button>
              <button class="btn btn-danger btn-icon-only" onclick="deleteDE_Material('${m.id}')" title="Eliminar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </td>
        </tr>`).join('');
}

function filterDE_Mat(query) {
    _deMatSearch = query.toLowerCase().trim();
    const filtered = _deMatSearch
        ? state.materials.filter(m =>
            m.id.toLowerCase().includes(_deMatSearch) ||
            m.code.toLowerCase().includes(_deMatSearch) ||
            m.desc.toLowerCase().includes(_deMatSearch) ||
            String(m.unit).toLowerCase().includes(_deMatSearch) ||
            m.uom.toLowerCase().includes(_deMatSearch) ||
            m.category.toLowerCase().includes(_deMatSearch))
        : state.materials;

    const tbody = document.getElementById('de-mat-tbody');
    const counter = document.getElementById('de-mat-count');
    if (tbody) tbody.innerHTML = buildDE_MatRows(filtered);
    if (counter) counter.innerText = `${filtered.length} ${_deMatSearch ? 'resultado' + (filtered.length !== 1 ? 's' : '') : 'registros'}`;
}

// --------------------------------------------------------------------------
//   IMPORTACIÓN EXCEL — MATERIALES
// --------------------------------------------------------------------------

// Mapa flexible de nombres de columna → campo interno
const _DE_MAT_COL_MAP = {
    codigo: 'code', código: 'code', code: 'code',
    descripcion: 'desc', descripción: 'desc', description: 'desc', desc: 'desc',
    unidad: 'unit', cantidad: 'unit', qty: 'unit', quantity: 'unit',
    unidadmedida: 'uom', 'unidad de medida': 'uom', uom: 'uom', um: 'uom', 'u.m.': 'uom',
    categoria: 'category', categoría: 'category', category: 'category', cat: 'category'
};

function _normalizeHeader(h) {
    return String(h).toLowerCase().trim().replace(/\s+/g, '');
}

function _parseSheetToMaterials(workbook) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (rows.length === 0) return [];

    // Mapear cabeceras del archivo a campos internos
    const headerKeys = Object.keys(rows[0]);
    const colMap = {};
    headerKeys.forEach(h => {
        const normalized = _normalizeHeader(h);
        if (_DE_MAT_COL_MAP[normalized]) colMap[h] = _DE_MAT_COL_MAP[normalized];
    });

    const required = ['code', 'desc'];
    const mapped = Object.values(colMap);
    const missing = required.filter(f => !mapped.includes(f));
    if (missing.length > 0) {
        throw new Error(`Columnas requeridas no encontradas: ${missing.join(', ')}. Verifica los encabezados del archivo.`);
    }

    return rows.map(row => {
        const obj = {};
        Object.entries(colMap).forEach(([excelCol, field]) => { obj[field] = String(row[excelCol]).trim(); });
        return obj;
    }).filter(r => r.code && r.desc);
}

function handleDE_MatFileInput(input) {
    if (!input.files.length) return;
    _readDE_MatFile(input.files[0]);
    input.value = '';
}

function handleDE_MatFileDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) _readDE_MatFile(file);
}

function _readDE_MatFile(file) {
    if (!_ensureXLSX()) return;
    const previewEl = document.getElementById('de-mat-import-preview');
    if (!previewEl) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        previewEl.innerHTML = `<p style="color:var(--accent-rose);font-size:.85rem;">Formato no admitido. Usa .xlsx, .xls o .csv.</p>`;
        return;
    }

    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            _deMatImportRows = _parseSheetToMaterials(wb);
            _renderDE_MatImportPreview(file.name);
        } catch (err) {
            previewEl.innerHTML = `<div class="de-import-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                ${err.message}
            </div>`;
        }
    };
    reader.readAsArrayBuffer(file);
}

function _renderDE_MatImportPreview(filename) {
    const el = document.getElementById('de-mat-import-preview');
    if (!el) return;

    if (_deMatImportRows.length === 0) {
        el.innerHTML = `<div class="de-import-error">El archivo no contiene filas válidas para importar.</div>`;
        return;
    }

    const preview = _deMatImportRows.slice(0, 5);
    const more = _deMatImportRows.length - preview.length;

    el.innerHTML = `
    <div class="de-import-preview-box">
      <div class="de-import-preview-header">
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>
          <strong>${filename}</strong> — <span style="color:var(--accent-emerald);">${_deMatImportRows.length} fila(s) detectadas</span>
        </span>
        <button class="btn btn-secondary btn-sm" onclick="cancelDE_MatImport()">Cancelar</button>
      </div>
      <div class="table-responsive" style="margin-top:.75rem;">
        <table class="custom-table">
          <thead><tr>
            <th>Código</th><th>Descripción</th><th>Unidad</th><th>U. de Medida</th><th>Categoría</th>
          </tr></thead>
          <tbody>
            ${preview.map(r => `
            <tr>
              <td style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:600;">${r.code || '—'}</td>
              <td>${r.desc || '—'}</td>
              <td style="text-align:center;">${r.unit || '—'}</td>
              <td><span class="badge badge-info">${r.uom || '—'}</span></td>
              <td>${r.category || '—'}</td>
            </tr>`).join('')}
            ${more > 0 ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);font-size:.8rem;">... y ${more} fila(s) más</td></tr>` : ''}
          </tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:.75rem;margin-top:1rem;">
        <button class="btn btn-secondary" onclick="cancelDE_MatImport()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmDE_MatImport()">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;"><polyline points="20 6 9 17 4 12"/></svg>
          Confirmar importación (${_deMatImportRows.length} registros)
        </button>
      </div>
    </div>`;
}

function confirmDE_MatImport() {
    let added = 0;
    const existingCodes = new Set(state.materials.map(m => m.code.toLowerCase()));

    _deMatImportRows.forEach(row => {
        if (existingCodes.has((row.code || '').toLowerCase())) return; // evitar duplicados por código
        const nextNum = state.materials.length + added + 1;
        state.materials.push({
            id: 'MAT-' + String(nextNum).padStart(4, '0'),
            code: row.code || '',
            desc: row.desc || '',
            unit: row.unit || '0',
            uom: row.uom || 'UN',
            category: row.category || 'Otros'
        });
        existingCodes.add((row.code || '').toLowerCase());
        added++;
    });

    saveDEKey('materials');
    _deMatImportRows = [];
    triggerToast('success', `${added} material(es) importados correctamente.`);
    renderDE_Materiales();
}

function cancelDE_MatImport() {
    _deMatImportRows = [];
    const el = document.getElementById('de-mat-import-preview');
    if (el) el.innerHTML = '';
}

function downloadDE_MatTemplate() {
    if (!_ensureXLSX()) return;
    const ws = XLSX.utils.aoa_to_sheet([
        ['Codigo', 'Descripcion', 'Unidad', 'UnidadMedida', 'Categoria'],
        ['COD-0001', 'Tornillo autoperforante 1/2"', '100', 'UN', 'Fijaciones y Anclajes'],
        ['COD-0002', 'Disco de corte 4.5" metal', '50', 'UN', 'Consumibles y EPP']
    ]);
    ws['!cols'] = [{ wch: 14 }, { wch: 38 }, { wch: 10 }, { wch: 14 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Materiales');
    XLSX.writeFile(wb, 'Plantilla_Materiales_Aureo.xlsx');
    triggerToast('success', 'Plantilla descargada correctamente.');
}

// --------------------------------------------------------------------------
//   APARTADO: PROVEEDORES
// --------------------------------------------------------------------------
function renderDE_Proveedores() {
    const isEdit = _deProvEditId !== null;
    const editing = isEdit ? state.suppliers.find(s => s.id === _deProvEditId) : null;
    const nextId = 'PROV-' + String(state.suppliers.length + 1).padStart(4, '0');

    const el = document.getElementById('dataentry-content');
    el.innerHTML = `
    <div class="dataentry-panel">

      <!-- FORMULARIO -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${isEdit ? 'Editar Proveedor' : 'Registrar Proveedor'}
          </span>
          ${isEdit ? `<button type="button" class="btn btn-secondary btn-sm" onclick="cancelDE_ProvEdit()">Cancelar edición</button>` : ''}
        </div>
        <form onsubmit="saveDE_Proveedor(event)">
          <input type="hidden" id="de-prov-edit-id" value="${isEdit ? editing.id : ''}">
          <div class="form-row" style="grid-template-columns: 140px 1fr 1fr;">
            <div class="form-group">
              <label class="form-label">ID</label>
              <input type="text" class="form-input" id="de-prov-id"
                value="${isEdit ? editing.id : nextId}" readonly
                style="opacity:.5;cursor:not-allowed;">
            </div>
            <div class="form-group">
              <label class="form-label">Proveedor</label>
              <input type="text" class="form-input" id="de-prov-name" required
                placeholder="Ej: Ferrox Andina Ltda."
                value="${isEdit ? editing.name : ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Acreedor <span style="font-size:.78rem;color:var(--text-muted);">(código del proveedor)</span></label>
              <input type="text" class="form-input" id="de-prov-acreedor" required
                placeholder="Ej: ACR-0012"
                value="${isEdit ? editing.acreedor : ''}">
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:.75rem;margin-top:.5rem;">
            ${isEdit ? `<button type="button" class="btn btn-secondary" onclick="cancelDE_ProvEdit()">Cancelar</button>` : ''}
            <button type="submit" class="btn btn-primary">
              ${isEdit ? 'Actualizar Proveedor' : 'Agregar Proveedor'}
            </button>
          </div>
        </form>
      </div>

      <!-- IMPORTAR EXCEL -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            Importar desde Excel
          </span>
          <button class="btn btn-secondary btn-sm" onclick="downloadDE_ProvTemplate()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Descargar plantilla
          </button>
        </div>
        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1.25rem;">
          El archivo debe tener las columnas: <strong style="color:var(--text-secondary);">Proveedor · Acreedor</strong> (primera fila = encabezados).
        </p>
        <div class="de-import-drop" id="de-prov-dropzone" onclick="document.getElementById('de-prov-file').click()"
          ondragover="event.preventDefault();this.classList.add('drag-over')"
          ondragleave="this.classList.remove('drag-over')"
          ondrop="this.classList.remove('drag-over');handleDE_ProvFileDrop(event)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>Arrastra tu archivo aquí o <strong>haz clic para seleccionar</strong></span>
          <span style="font-size:.78rem;color:var(--text-muted);">Formatos aceptados: .xlsx · .xls · .csv</span>
          <input type="file" id="de-prov-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleDE_ProvFileInput(this)">
        </div>
        <div id="de-prov-import-preview" style="margin-top:1.25rem;"></div>
      </div>

      <!-- TABLA -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">Proveedores Registrados</span>
          <span class="badge badge-info" id="de-prov-count">${state.suppliers.length} registros</span>
        </div>
        <div class="input-wrapper" style="margin-bottom:1.25rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="form-input" id="de-prov-search"
            placeholder="Buscar por ID, proveedor o acreedor..."
            value="${_deProvSearch}"
            oninput="filterDE_Prov(this.value)">
        </div>
        <div class="table-responsive">
          <table class="custom-table">
            <thead><tr>
              <th>ID</th>
              <th>Proveedor</th>
              <th>Acreedor</th>
              <th style="text-align:center;">Acciones</th>
            </tr></thead>
            <tbody id="de-prov-tbody">
              ${buildDE_ProvRows(state.suppliers)}
            </tbody>
          </table>
        </div>
      </div>

    </div>`;
}

function buildDE_ProvRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">Sin proveedores registrados.</td></tr>`;
    }
    return list.map(s => `
    <tr>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.8rem;color:var(--accent-gold);font-weight:700;">${s.id}</td>
      <td><span class="product-name">${s.name}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.85rem;font-weight:600;">${s.acreedor || '—'}</td>
      <td style="text-align:center;">
        <div style="display:inline-flex;gap:.5rem;">
          <button class="btn btn-secondary btn-icon-only" onclick="editDE_Proveedor('${s.id}')" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="btn btn-danger btn-icon-only" onclick="deleteDE_Proveedor('${s.id}')" title="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function filterDE_Prov(query) {
    _deProvSearch = query.toLowerCase().trim();
    const filtered = _deProvSearch
        ? state.suppliers.filter(s =>
            (s.id || '').toLowerCase().includes(_deProvSearch) ||
            (s.name || '').toLowerCase().includes(_deProvSearch) ||
            (s.acreedor || '').toLowerCase().includes(_deProvSearch))
        : state.suppliers;

    const tbody = document.getElementById('de-prov-tbody');
    const counter = document.getElementById('de-prov-count');
    if (tbody) tbody.innerHTML = buildDE_ProvRows(filtered);
    if (counter) counter.innerText = `${filtered.length} ${_deProvSearch ? 'resultado' + (filtered.length !== 1 ? 's' : '') : 'registros'}`;
}

function saveDE_Proveedor(e) {
    e.preventDefault();
    const editId = document.getElementById('de-prov-edit-id').value;
    const prov = {
        id: editId || 'PROV-' + String(state.suppliers.length + 1).padStart(4, '0'),
        name: document.getElementById('de-prov-name').value.trim(),
        acreedor: document.getElementById('de-prov-acreedor').value.trim()
    };
    if (editId) {
        const idx = state.suppliers.findIndex(s => s.id === editId);
        if (idx !== -1) state.suppliers[idx] = prov;
        triggerToast('success', `Proveedor "${escapeHtml(prov.name)}" actualizado.`);
        _deProvEditId = null;
    } else {
        state.suppliers.push(prov);
        triggerToast('success', `Proveedor "${escapeHtml(prov.name)}" registrado.`);
    }
    saveDEKey('suppliers');
    renderDE_Proveedores();
}

function editDE_Proveedor(id) {
    _deProvEditId = id;
    renderDE_Proveedores();
    document.getElementById('dataentry-content').scrollIntoView({ behavior: 'smooth' });
}

function cancelDE_ProvEdit() {
    _deProvEditId = null;
    renderDE_Proveedores();
}

function deleteDE_Proveedor(id) {
    const s = state.suppliers.find(s => s.id === id);
    if (!s) return;
    if (!confirm(`¿Eliminar proveedor "${s.name}" (${s.acreedor})?`)) return;
    state.suppliers = state.suppliers.filter(s => s.id !== id);
    saveDEKey('suppliers');
    if (_deProvEditId === id) _deProvEditId = null;
    renderDE_Proveedores();
}

// --- Importación Excel Proveedores ---
const _DE_PROV_COL_MAP = {
    proveedor: 'name', provider: 'name', nombre: 'name', name: 'name',
    acreedor: 'acreedor', creditor: 'acreedor', codigo: 'acreedor', code: 'acreedor'
};

function handleDE_ProvFileInput(input) {
    if (!input.files.length) return;
    _readDE_ProvFile(input.files[0]);
    input.value = '';
}

function handleDE_ProvFileDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) _readDE_ProvFile(file);
}

function _readDE_ProvFile(file) {
    if (!_ensureXLSX()) return;
    const previewEl = document.getElementById('de-prov-import-preview');
    if (!previewEl) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        previewEl.innerHTML = `<div class="de-import-error">Formato no admitido. Usa .xlsx, .xls o .csv.</div>`;
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            if (rows.length === 0) throw new Error('El archivo no contiene filas con datos.');

            const colMap = {};
            Object.keys(rows[0]).forEach(h => {
                const n = h.toLowerCase().trim().replace(/\s+/g, '');
                if (_DE_PROV_COL_MAP[n]) colMap[h] = _DE_PROV_COL_MAP[n];
            });
            if (!Object.values(colMap).includes('name')) {
                throw new Error('Columna "Proveedor" no encontrada. Verifica los encabezados.');
            }

            _deProvImportRows = rows.map(row => {
                const obj = {};
                Object.entries(colMap).forEach(([col, field]) => { obj[field] = String(row[col]).trim(); });
                return obj;
            }).filter(r => r.name);

            _renderDE_ProvImportPreview(file.name);
        } catch (err) {
            previewEl.innerHTML = `<div class="de-import-error">${err.message}</div>`;
        }
    };
    reader.readAsArrayBuffer(file);
}

function _renderDE_ProvImportPreview(filename) {
    const el = document.getElementById('de-prov-import-preview');
    if (!el || _deProvImportRows.length === 0) return;
    const preview = _deProvImportRows.slice(0, 5);
    const more = _deProvImportRows.length - preview.length;
    el.innerHTML = `
    <div class="de-import-preview-box">
      <div class="de-import-preview-header">
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>
          <strong>${filename}</strong> — <span style="color:var(--accent-emerald);">${_deProvImportRows.length} fila(s) detectadas</span>
        </span>
        <button class="btn btn-secondary btn-sm" onclick="cancelDE_ProvImport()">Cancelar</button>
      </div>
      <div class="table-responsive" style="margin-top:.75rem;">
        <table class="custom-table">
          <thead><tr><th>Proveedor</th><th>Acreedor</th></tr></thead>
          <tbody>
            ${preview.map(r => `
            <tr>
              <td>${r.name || '—'}</td>
              <td style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:600;">${r.acreedor || '—'}</td>
            </tr>`).join('')}
            ${more > 0 ? `<tr><td colspan="2" style="text-align:center;color:var(--text-muted);font-size:.8rem;">... y ${more} fila(s) más</td></tr>` : ''}
          </tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:.75rem;margin-top:1rem;">
        <button class="btn btn-secondary" onclick="cancelDE_ProvImport()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmDE_ProvImport()">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;"><polyline points="20 6 9 17 4 12"/></svg>
          Confirmar importación (${_deProvImportRows.length} registros)
        </button>
      </div>
    </div>`;
}

function confirmDE_ProvImport() {
    let added = 0;
    const existingAcreedores = new Set(state.suppliers.map(s => (s.acreedor || '').toLowerCase()));
    _deProvImportRows.forEach((row, i) => {
        const acr = (row.acreedor || '').toLowerCase();
        if (acr && existingAcreedores.has(acr)) return;
        const nextNum = state.suppliers.length + added + 1;
        state.suppliers.push({
            id: 'PROV-' + String(nextNum).padStart(4, '0'),
            name: row.name || '',
            acreedor: row.acreedor || ''
        });
        if (acr) existingAcreedores.add(acr);
        added++;
    });
    saveDEKey('suppliers');
    _deProvImportRows = [];
    triggerToast('success', `${added} proveedor(es) importados correctamente.`);
    renderDE_Proveedores();
}

function cancelDE_ProvImport() {
    _deProvImportRows = [];
    const el = document.getElementById('de-prov-import-preview');
    if (el) el.innerHTML = '';
}

function downloadDE_ProvTemplate() {
    if (!_ensureXLSX()) return;
    const ws = XLSX.utils.aoa_to_sheet([
        ['Proveedor', 'Acreedor'],
        ['Ferrox Andina Ltda.', 'ACR-0001'],
        ['TitanPro Abrasivos S.A.', 'ACR-0002']
    ]);
    ws['!cols'] = [{ wch: 32 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Proveedores');
    XLSX.writeFile(wb, 'Plantilla_Proveedores_Aureo.xlsx');
    triggerToast('success', 'Plantilla descargada correctamente.');
}

// --------------------------------------------------------------------------
//   APARTADO: UBICACIONES
// --------------------------------------------------------------------------
function _calcUbicFinal(base, position) {
    const b = String(base || '').trim();
    const p = String(position || '').trim();
    if (!b) return '';
    return p ? `${b}-${p}` : b;
}

function renderDE_Ubicaciones() {
    const isEdit = _deUbicEditId !== null;
    const editing = isEdit ? state.locations.find(l => l.id === _deUbicEditId) : null;
    const nextId = 'UBIC-' + String(state.locations.length + 1).padStart(4, '0');

    const v = (field, fallback = '') => isEdit ? (editing[field] ?? fallback) : fallback;

    const el = document.getElementById('dataentry-content');
    el.innerHTML = `
    <div class="dataentry-panel">

      <!-- FORMULARIO -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
            ${isEdit ? 'Editar Ubicación' : 'Registrar Ubicación'}
          </span>
          ${isEdit ? `<button type="button" class="btn btn-secondary btn-sm" onclick="cancelDE_UbicEdit()">Cancelar edición</button>` : ''}
        </div>
        <form onsubmit="saveDE_Ubicacion(event)">
          <input type="hidden" id="de-loc-edit-id" value="${isEdit ? editing.id : ''}">
          <div class="form-row" style="grid-template-columns: 1fr 1fr 1fr;">
            <div class="form-group">
              <label class="form-label">Ubicación Base <span style="font-size:.75rem;color:var(--text-muted);">(centenas)</span></label>
              <input type="number" class="form-input" id="de-loc-base" required
                min="100" step="100" placeholder="100"
                value="${v('base', '')}"
                oninput="updateDE_UbicFinal()">
            </div>
            <div class="form-group">
              <label class="form-label">Posición <span style="font-size:.75rem;color:var(--text-muted);">— por determinar</span></label>
              <input type="text" class="form-input" id="de-loc-position"
                placeholder="Por determinar"
                value="${v('position', '')}"
                oninput="updateDE_UbicFinal()">
            </div>
            <div class="form-group">
              <label class="form-label">Ubicación Final <span style="font-size:.75rem;color:var(--text-muted);">(auto)</span></label>
              <input type="text" class="form-input" id="de-loc-final"
                value="${isEdit ? _calcUbicFinal(editing.base, editing.position) : ''}" readonly
                style="opacity:.6;cursor:not-allowed;font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent-gold);">
            </div>
          </div>
          <div class="form-row" style="grid-template-columns: 1fr 1fr auto;">
            <div class="form-group">
              <label class="form-label">Zona <span style="font-size:.75rem;color:var(--text-muted);">(= Ubicación Base)</span></label>
              <input type="text" class="form-input" id="de-loc-zona"
                value="${isEdit ? (editing.base || '') : ''}" readonly
                style="opacity:.6;cursor:not-allowed;font-family:'JetBrains Mono',monospace;">
            </div>
            <div class="form-group">
              <label class="form-label">Zona Bodega</label>
              <select class="form-select" id="de-loc-warehouse">
                <option value="Bodegas Externas" ${v('warehouse') === 'Bodegas Externas' || !isEdit ? 'selected' : ''}>Bodegas Externas</option>
                <option value="Bodegas Internas" ${v('warehouse') === 'Bodegas Internas' ? 'selected' : ''}>Bodegas Internas</option>
              </select>
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end;">
              <div style="display:flex;gap:.75rem;">
                ${isEdit ? `<button type="button" class="btn btn-secondary" onclick="cancelDE_UbicEdit()">Cancelar</button>` : ''}
                <button type="submit" class="btn btn-primary">
                  ${isEdit ? 'Actualizar' : 'Agregar Ubicación'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      <!-- IMPORTAR EXCEL -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            Importar desde Excel
          </span>
          <button class="btn btn-secondary btn-sm" onclick="downloadDE_UbicTemplate()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Descargar plantilla
          </button>
        </div>
        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1.25rem;">
          El archivo debe tener las columnas: <strong style="color:var(--text-secondary);">Ubicacion · Posiciones · Zona · Bodega</strong> (primera fila = encabezados).
        </p>
        <div class="de-import-drop" onclick="document.getElementById('de-ubic-file').click()"
          ondragover="event.preventDefault();this.classList.add('drag-over')"
          ondragleave="this.classList.remove('drag-over')"
          ondrop="this.classList.remove('drag-over');handleDE_UbicFileDrop(event)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>Arrastra tu archivo aquí o <strong>haz clic para seleccionar</strong></span>
          <span style="font-size:.78rem;color:var(--text-muted);">Formatos aceptados: .xlsx · .xls · .csv</span>
          <input type="file" id="de-ubic-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleDE_UbicFileInput(this)">
        </div>
        <div id="de-ubic-import-preview" style="margin-top:1.25rem;"></div>
      </div>

      <!-- TABLA -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">Ubicaciones Registradas</span>
          <span class="badge badge-info" id="de-ubic-count">${state.locations.length} registros</span>
        </div>
        <div class="input-wrapper" style="margin-bottom:1.25rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="form-input" id="de-ubic-search"
            placeholder="Buscar por ID, código, bodega, pasillo o categoría..."
            value="${_deUbicSearch}"
            oninput="filterDE_Ubic(this.value)">
        </div>
        <div class="table-responsive">
          <table class="custom-table">
            <thead><tr>
              <th>Ubicación Base</th>
              <th>Posición</th>
              <th>Ubicación Final</th>
              <th>Zona</th>
              <th>Zona Bodega</th>
              <th style="text-align:center;">Acciones</th>
            </tr></thead>
            <tbody id="de-ubic-tbody">
              ${buildDE_UbicRows(state.locations)}
            </tbody>
          </table>
        </div>
      </div>

    </div>`;
}

function buildDE_UbicRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">Sin ubicaciones registradas.</td></tr>`;
    }
    return list.map(l => `
    <tr>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.9rem;font-weight:700;text-align:center;">${l.base}</td>
      <td style="color:var(--text-muted);font-style:italic;">${l.position || 'Por determinar'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent-gold);">${l.final || l.base}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.9rem;text-align:center;">${l.base}</td>
      <td><span class="badge ${l.warehouse === 'Bodegas Externas' ? 'badge-info' : 'badge-success'}">${l.warehouse}</span></td>
      <td style="text-align:center;">
        <div style="display:inline-flex;gap:.5rem;">
          <button class="btn btn-secondary btn-icon-only" onclick="editDE_Ubicacion('${l.id}')" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="btn btn-danger btn-icon-only" onclick="deleteDE_Ubicacion('${l.id}')" title="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function updateDE_UbicFinal() {
    const base = document.getElementById('de-loc-base')?.value || '';
    const position = document.getElementById('de-loc-position')?.value || '';
    const final = _calcUbicFinal(base, position);
    const finalEl = document.getElementById('de-loc-final');
    const zonaEl = document.getElementById('de-loc-zona');
    if (finalEl) finalEl.value = final;
    if (zonaEl) zonaEl.value = base;
}

function filterDE_Ubic(query) {
    _deUbicSearch = query.toLowerCase().trim();
    const filtered = _deUbicSearch
        ? state.locations.filter(l =>
            (l.id || '').toLowerCase().includes(_deUbicSearch) ||
            String(l.base || '').includes(_deUbicSearch) ||
            (l.position || '').toLowerCase().includes(_deUbicSearch) ||
            (l.final || '').toLowerCase().includes(_deUbicSearch) ||
            (l.warehouse || '').toLowerCase().includes(_deUbicSearch))
        : state.locations;

    const tbody = document.getElementById('de-ubic-tbody');
    const counter = document.getElementById('de-ubic-count');
    if (tbody) tbody.innerHTML = buildDE_UbicRows(filtered);
    if (counter) counter.innerText = `${filtered.length} ${_deUbicSearch ? 'resultado' + (filtered.length !== 1 ? 's' : '') : 'registros'}`;
}

function saveDE_Ubicacion(e) {
    e.preventDefault();
    const editId = document.getElementById('de-loc-edit-id').value;
    const base = parseInt(document.getElementById('de-loc-base').value) || 0;
    const position = document.getElementById('de-loc-position').value.trim();
    const loc = {
        id: editId || 'UBIC-' + String(state.locations.length + 1).padStart(4, '0'),
        base,
        position,
        final: _calcUbicFinal(base, position),
        warehouse: document.getElementById('de-loc-warehouse').value
    };
    if (editId) {
        const idx = state.locations.findIndex(l => l.id === editId);
        if (idx !== -1) state.locations[idx] = loc;
        triggerToast('success', `Ubicación "${loc.final}" actualizada.`);
        _deUbicEditId = null;
    } else {
        state.locations.push(loc);
        triggerToast('success', `Ubicación "${loc.final}" registrada.`);
    }
    saveDEKey('locations');
    renderDE_Ubicaciones();
}

function editDE_Ubicacion(id) {
    _deUbicEditId = id;
    renderDE_Ubicaciones();
    document.getElementById('dataentry-content').scrollIntoView({ behavior: 'smooth' });
}

function cancelDE_UbicEdit() {
    _deUbicEditId = null;
    renderDE_Ubicaciones();
}

function deleteDE_Ubicacion(id) {
    const l = state.locations.find(l => l.id === id);
    if (!l) return;
    if (!confirm(`¿Eliminar ubicación "${l.code}"?`)) return;
    state.locations = state.locations.filter(l => l.id !== id);
    saveDEKey('locations');
    if (_deUbicEditId === id) _deUbicEditId = null;
    renderDE_Ubicaciones();
}

// --- Importación Excel Ubicaciones ---
const _DE_UBIC_COL_MAP = {
    ubicacion: 'base', ubicación: 'base', base: 'base',
    posiciones: 'position', posicion: 'position', posición: 'position', position: 'position',
    zona: 'zona',
    bodega: 'warehouse', warehouse: 'warehouse'
};

function handleDE_UbicFileInput(input) {
    if (!input.files.length) return;
    _readDE_UbicFile(input.files[0]);
    input.value = '';
}

function handleDE_UbicFileDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) _readDE_UbicFile(file);
}

function _readDE_UbicFile(file) {
    if (!_ensureXLSX()) return;
    const previewEl = document.getElementById('de-ubic-import-preview');
    if (!previewEl) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        previewEl.innerHTML = `<div class="de-import-error">Formato no admitido. Usa .xlsx, .xls o .csv.</div>`;
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            if (rows.length === 0) throw new Error('El archivo no contiene filas con datos.');

            const colMap = {};
            Object.keys(rows[0]).forEach(h => {
                const n = h.toLowerCase().trim().replace(/\s+/g, '');
                if (_DE_UBIC_COL_MAP[n]) colMap[h] = _DE_UBIC_COL_MAP[n];
            });
            if (!Object.values(colMap).includes('base')) {
                throw new Error('Columna "Ubicacion" no encontrada. Verifica los encabezados.');
            }

            _deUbicImportRows = rows.map(row => {
                const obj = {};
                Object.entries(colMap).forEach(([col, field]) => { obj[field] = String(row[col]).trim(); });
                // Calcular ubicación final uniendo base + posición
                obj.final = _calcUbicFinal(obj.base, obj.position);
                return obj;
            }).filter(r => r.base);

            _renderDE_UbicImportPreview(file.name);
        } catch (err) {
            previewEl.innerHTML = `<div class="de-import-error">${err.message}</div>`;
        }
    };
    reader.readAsArrayBuffer(file);
}

function _renderDE_UbicImportPreview(filename) {
    const el = document.getElementById('de-ubic-import-preview');
    if (!el || _deUbicImportRows.length === 0) return;
    const preview = _deUbicImportRows.slice(0, 5);
    const more = _deUbicImportRows.length - preview.length;
    el.innerHTML = `
    <div class="de-import-preview-box">
      <div class="de-import-preview-header">
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>
          <strong>${filename}</strong> — <span style="color:var(--accent-emerald);">${_deUbicImportRows.length} fila(s) detectadas</span>
        </span>
        <button class="btn btn-secondary btn-sm" onclick="cancelDE_UbicImport()">Cancelar</button>
      </div>
      <div class="table-responsive" style="margin-top:.75rem;">
        <table class="custom-table">
          <thead><tr><th>Ubicacion</th><th>Posiciones</th><th>Zona</th><th>Bodega</th></tr></thead>
          <tbody>
            ${preview.map(r => `
            <tr>
              <td style="font-family:'JetBrains Mono',monospace;font-weight:700;text-align:center;">${r.base || '—'}</td>
              <td style="color:var(--text-muted);font-style:italic;">${r.position || 'Por determinar'}</td>
              <td style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent-gold);">${r.final || r.base || '—'}</td>
              <td><span class="badge ${r.warehouse === 'Bodegas Externas' ? 'badge-info' : 'badge-success'}">${r.warehouse || '—'}</span></td>
            </tr>`).join('')}
            ${more > 0 ? `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);font-size:.8rem;">... y ${more} fila(s) más</td></tr>` : ''}
          </tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:.75rem;margin-top:1rem;">
        <button class="btn btn-secondary" onclick="cancelDE_UbicImport()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmDE_UbicImport()">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;"><polyline points="20 6 9 17 4 12"/></svg>
          Confirmar importación (${_deUbicImportRows.length} registros)
        </button>
      </div>
    </div>`;
}

function confirmDE_UbicImport() {
    let added = 0;
    const existingFinals = new Set(state.locations.map(l => (l.final || '').toLowerCase()));
    _deUbicImportRows.forEach(row => {
        const final = (row.final || '').toLowerCase();
        if (final && existingFinals.has(final)) return;
        const nextNum = state.locations.length + added + 1;
        const base = parseInt(row.base) || 0;
        state.locations.push({
            id: 'UBIC-' + String(nextNum).padStart(4, '0'),
            base,
            position: row.position || '',
            final: row.final || _calcUbicFinal(base, row.position),
            warehouse: row.warehouse || 'Bodegas Externas'
        });
        if (final) existingFinals.add(final);
        added++;
    });
    saveDEKey('locations');
    _deUbicImportRows = [];
    triggerToast('success', `${added} ubicación(es) importadas correctamente.`);
    renderDE_Ubicaciones();
}

function cancelDE_UbicImport() {
    _deUbicImportRows = [];
    const el = document.getElementById('de-ubic-import-preview');
    if (el) el.innerHTML = '';
}

function downloadDE_UbicTemplate() {
    if (!_ensureXLSX()) return;
    const ws = XLSX.utils.aoa_to_sheet([
        ['Ubicacion', 'Posiciones', 'Zona', 'Bodega'],
        ['100', 'A', '100', 'Bodegas Externas'],
        ['200', 'B', '200', 'Bodegas Internas'],
        ['300', '', '300', 'Bodegas Externas']
    ]);
    ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ubicaciones');
    XLSX.writeFile(wb, 'Plantilla_Ubicaciones_Aureo.xlsx');
    triggerToast('success', 'Plantilla descargada correctamente.');
}

// --------------------------------------------------------------------------
//   APARTADO: MOVIMIENTOS
// --------------------------------------------------------------------------
function _nowDatetimeLocal() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderDE_Movimientos() {
    const isEdit = _deMovEditId !== null;
    const editing = isEdit ? state.movements.find(m => m.id === _deMovEditId) : null;
    const v = (f, fb = '') => isEdit ? (editing[f] ?? fb) : fb;

    const matOptions = state.materials.map(m =>
        `<option value="${m.id}" ${isEdit && editing.materialId === m.id ? 'selected' : ''}>${m.id} — ${m.desc}</option>`
    ).join('');

    const ubicOptions = [...new Set(state.locations.map(l => l.base))].sort((a, b) => a - b).map(b =>
        `<option value="${b}" ${isEdit && String(editing.ubicBase) === String(b) ? 'selected' : ''}>${b}</option>`
    ).join('');

    const el = document.getElementById('dataentry-content');
    el.innerHTML = `
    <div class="dataentry-panel">

      <!-- FORMULARIO -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            ${isEdit ? 'Editar Movimiento' : 'Registrar Movimiento'}
          </span>
          ${isEdit ? `<button type="button" class="btn btn-secondary btn-sm" onclick="cancelDE_MovEdit()">Cancelar edición</button>` : ''}
        </div>
        <form onsubmit="saveDE_Movimiento(event)">
          <input type="hidden" id="de-mov-edit-id" value="${isEdit ? editing.id : ''}">

          <!-- Fila 1: Fecha/hora · Tipo · Estado -->
          <div class="form-row" style="grid-template-columns:1.4fr 1fr 1fr;">
            <div class="form-group">
              <label class="form-label">Fecha y Hora</label>
              <input type="datetime-local" class="form-input" id="de-mov-datetime" required value="${v('datetime', _nowDatetimeLocal())}">
            </div>
            <div class="form-group">
              <label class="form-label">Tipo</label>
              <select class="form-select" id="de-mov-type">
                <option value="Entrada" ${v('type') === 'Entrada' || !isEdit ? 'selected' : ''}>Entrada</option>
                <option value="Salida"  ${v('type') === 'Salida' ? 'selected' : ''}>Salida</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Estado</label>
              <select class="form-select" id="de-mov-status">
                <option value="Almacenado"  ${v('status', 'Almacenado') === 'Almacenado' ? 'selected' : ''}>Almacenado</option>
                <option value="En Tránsito" ${v('status') === 'En Tránsito' ? 'selected' : ''}>En Tránsito</option>
              </select>
            </div>
          </div>

          <!-- Fila 2: Usuario · Documento -->
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Usuario</label>
              <input type="text" class="form-input" id="de-mov-user" placeholder="Ej: jperez" value="${v('user')}">
            </div>
            <div class="form-group">
              <label class="form-label">Documento</label>
              <input type="text" class="form-input" id="de-mov-doc" placeholder="Ej: OC-2026-0045" value="${v('doc')}">
            </div>
          </div>

          <!-- Fila 3: Material ID · Descripción · UM · Categoría -->
          <div class="form-row" style="grid-template-columns:1fr 1.5fr 0.6fr 1fr;">
            <div class="form-group">
              <label class="form-label">Material (ID)</label>
              <select class="form-select" id="de-mov-material" onchange="autoFillDE_MovMaterial()">
                <option value="">— Seleccionar —</option>
                ${matOptions}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Descripción</label>
              <input type="text" class="form-input" id="de-mov-desc" placeholder="Se llena al seleccionar material" value="${v('desc')}">
            </div>
            <div class="form-group">
              <label class="form-label">UM</label>
              <input type="text" class="form-input" id="de-mov-um" placeholder="UN" value="${v('um')}">
            </div>
            <div class="form-group">
              <label class="form-label">Categoría</label>
              <input type="text" class="form-input" id="de-mov-category" placeholder="Se llena automático" value="${v('category')}">
            </div>
          </div>

          <!-- Fila 4: Ubic. Base · Posición · Ubic. Final · Zona -->
          <div class="form-row" style="grid-template-columns:0.8fr 0.8fr 1fr 0.8fr;">
            <div class="form-group">
              <label class="form-label">Ubicación Base</label>
              <select class="form-select" id="de-mov-ubic-base" onchange="updateDE_MovUbicFinal()">
                <option value="">— Seleccionar —</option>
                ${ubicOptions}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Posición</label>
              <input type="text" class="form-input" id="de-mov-position" placeholder="Por determinar" value="${v('position')}" oninput="updateDE_MovUbicFinal()">
            </div>
            <div class="form-group">
              <label class="form-label">Ubicación Final <span style="font-size:.75rem;color:var(--text-muted);">(auto)</span></label>
              <input type="text" class="form-input" id="de-mov-ubic-final" readonly
                value="${isEdit ? _calcUbicFinal(editing.ubicBase, editing.position) : ''}"
                style="opacity:.6;cursor:not-allowed;font-family:'JetBrains Mono',monospace;font-weight:700;">
            </div>
            <div class="form-group">
              <label class="form-label">Zona <span style="font-size:.75rem;color:var(--text-muted);">(auto)</span></label>
              <input type="text" class="form-input" id="de-mov-zona" readonly
                value="${isEdit ? (editing.ubicBase || '') : ''}"
                style="opacity:.6;cursor:not-allowed;font-family:'JetBrains Mono',monospace;">
            </div>
          </div>

          <!-- Fila 5: Bodega · Lote Almacén · Lote Proveedor -->
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Bodega</label>
              <select class="form-select" id="de-mov-bodega">
                <option value="Bodegas Externas" ${v('bodega', 'Bodegas Externas') === 'Bodegas Externas' ? 'selected' : ''}>Bodegas Externas</option>
                <option value="Bodegas Internas" ${v('bodega') === 'Bodegas Internas' ? 'selected' : ''}>Bodegas Internas</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Lote Almacén</label>
              <input type="text" class="form-input" id="de-mov-lot-alm" placeholder="Ej: LA-0023" value="${v('lotAlm')}">
            </div>
            <div class="form-group">
              <label class="form-label">Lote Proveedor</label>
              <input type="text" class="form-input" id="de-mov-lot-prov" placeholder="Ej: LP-9912" value="${v('lotProv')}">
            </div>
          </div>

          <!-- Fila 6: Vencimiento · Cantidad -->
          <div class="form-row" style="grid-template-columns:1fr 1fr 1fr;">
            <div class="form-group">
              <label class="form-label">Vencimiento</label>
              <input type="date" class="form-input" id="de-mov-expiry" value="${v('expiry')}">
            </div>
            <div class="form-group">
              <label class="form-label">Cantidad</label>
              <input type="number" class="form-input" id="de-mov-qty" required min="1" placeholder="0" value="${v('qty')}">
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end;">
              <div style="display:flex;gap:.75rem;width:100%;">
                ${isEdit ? `<button type="button" class="btn btn-secondary" style="flex:1;" onclick="cancelDE_MovEdit()">Cancelar</button>` : ''}
                <button type="submit" class="btn btn-primary" style="flex:1;">
                  ${isEdit ? 'Actualizar' : 'Registrar Movimiento'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      <!-- TABLA -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">Movimientos Registrados</span>
          <span class="badge badge-info" id="de-mov-count">${state.movements.length} registros</span>
        </div>

        <!-- BÚSQUEDA MANUAL -->
        <div class="input-wrapper" style="margin-bottom:1.25rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="form-input" id="de-mov-search"
            placeholder="Buscar por usuario, documento, material, descripción, lote..."
            oninput="applyDE_MovFilters()">
        </div>

        <!-- BARRA DE FILTROS -->
        <div class="de-mov-filterbar">

          <!-- Tipo -->
          <div class="de-mov-filter-group">
            <span class="de-mov-filter-label">Tipo</span>
            <div class="de-filter-pills" data-group="tipo">
              ${['todos', 'Entrada', 'Salida', 'Stock'].map(v => `
              <button class="de-filter-pill ${_deMovFilters.tipo === v ? 'active' : ''}"
                data-value="${v}" onclick="setDE_MovFilter('tipo','${v}')">
                ${v === 'todos' ? 'Todos' : v}
              </button>`).join('')}
            </div>
          </div>

          <!-- Estado -->
          <div class="de-mov-filter-group">
            <span class="de-mov-filter-label">Estado</span>
            <div class="de-filter-pills" data-group="estado">
              ${['todos', 'Almacenado', 'En Tránsito'].map(v => `
              <button class="de-filter-pill ${_deMovFilters.estado === v ? 'active' : ''}"
                data-value="${v}" onclick="setDE_MovFilter('estado','${v}')">
                ${v === 'todos' ? 'Todos' : v}
              </button>`).join('')}
            </div>
          </div>

          <!-- Bodega -->
          <div class="de-mov-filter-group">
            <span class="de-mov-filter-label">Bodega</span>
            <select class="form-select de-mov-filter-select" onchange="setDE_MovFilter('bodega',this.value)">
              <option value="todas"  ${_deMovFilters.bodega === 'todas' ? 'selected' : ''}>Todas las Bodegas</option>
              <option value="Bodegas Externas" ${_deMovFilters.bodega === 'Bodegas Externas' ? 'selected' : ''}>Bodegas Externas</option>
              <option value="Bodegas Internas" ${_deMovFilters.bodega === 'Bodegas Internas' ? 'selected' : ''}>Bodegas Internas</option>
            </select>
          </div>

          <!-- Zona -->
          <div class="de-mov-filter-group">
            <span class="de-mov-filter-label">Zona</span>
            <select class="form-select de-mov-filter-select" onchange="setDE_MovFilter('zona',this.value)">
              <option value="todas" ${_deMovFilters.zona === 'todas' ? 'selected' : ''}>Todas las Zonas</option>
              ${[...new Set([
        ...state.locations.map(l => String(l.base)),
        ...state.movements.map(m => String(m.ubicBase || '')).filter(Boolean)
    ])].sort((a, b) => Number(a) - Number(b)).map(z =>
        `<option value="${z}" ${_deMovFilters.zona === z ? 'selected' : ''}>${z}</option>`
    ).join('')}
            </select>
          </div>

          <!-- Rango de Fechas -->
          <div class="de-mov-filter-group">
            <span class="de-mov-filter-label">Rango de Fechas</span>
            <div style="display:flex;align-items:center;gap:.5rem;">
              <div>
                <span style="font-size:.75rem;color:var(--text-muted);display:block;margin-bottom:.2rem;">Fecha desde</span>
                <input type="date" class="form-input de-mov-filter-date" id="de-mov-filter-desde"
                  value="${_deMovFilters.desde}" oninput="setDE_MovFilter('desde',this.value)">
              </div>
              <span style="color:var(--text-muted);margin-top:1.1rem;">→</span>
              <div>
                <span style="font-size:.75rem;color:var(--text-muted);display:block;margin-bottom:.2rem;">Fecha hasta</span>
                <input type="date" class="form-input de-mov-filter-date" id="de-mov-filter-hasta"
                  value="${_deMovFilters.hasta}" oninput="setDE_MovFilter('hasta',this.value)">
              </div>
              ${(_deMovFilters.desde || _deMovFilters.hasta) ? `
              <button class="btn btn-secondary btn-sm" style="margin-top:1.1rem;" onclick="clearDE_MovDates()">✕</button>` : ''}
            </div>
          </div>

        </div>
        <div class="table-responsive">
          <table class="custom-table">
            <thead><tr>
              <th>Fecha / Hora</th><th>Tipo</th><th>Estado</th><th>Usuario</th><th>Documento</th>
              <th>Material ID</th><th>Descripción</th><th>UM</th><th>Categoría</th>
              <th>Ubic. Base</th><th>Posición</th><th>Ubic. Final</th><th>Zona</th><th>Bodega</th>
              <th>Lote Alm.</th><th>Lote Prov.</th><th>Vencimiento</th><th style="text-align:center;">Cant.</th>
              <th style="text-align:center;">Acciones</th>
            </tr></thead>
            <tbody id="de-mov-tbody">
              ${buildDE_MovRows(state.movements)}
            </tbody>
          </table>
        </div>
      </div>

    </div>`;
}

function autoFillDE_MovMaterial() {
    const id = document.getElementById('de-mov-material')?.value;
    const mat = state.materials.find(m => m.id === id);
    if (!mat) return;
    const descEl = document.getElementById('de-mov-desc');
    const umEl = document.getElementById('de-mov-um');
    const catEl = document.getElementById('de-mov-category');
    if (descEl) descEl.value = mat.desc || '';
    if (umEl) umEl.value = mat.uom || '';
    if (catEl) catEl.value = mat.category || '';
}

function updateDE_MovUbicFinal() {
    const base = document.getElementById('de-mov-ubic-base')?.value || '';
    const pos = document.getElementById('de-mov-position')?.value || '';
    const finalEl = document.getElementById('de-mov-ubic-final');
    const zonaEl = document.getElementById('de-mov-zona');
    if (finalEl) finalEl.value = _calcUbicFinal(base, pos);
    if (zonaEl) zonaEl.value = base;
}

function buildDE_MovRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="19" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">Sin movimientos registrados.</td></tr>`;
    }
    const typeBadge = { 'Entrada': 'badge-success', 'Salida': 'badge-danger' };
    const statBadge = { 'Almacenado': 'badge-info', 'En Tránsito': 'badge-warning' };
    return [...list].reverse().map(m => `
    <tr>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;white-space:nowrap;">${(m.datetime || '').replace('T', ' ')}</td>
      <td><span class="badge ${typeBadge[m.type] || 'badge-info'}">${m.type || '—'}</span></td>
      <td><span class="badge ${statBadge[m.status] || 'badge-info'}">${m.status || '—'}</span></td>
      <td style="font-size:.82rem;">${m.user || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${m.doc || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--accent-gold);font-weight:700;">${m.materialId || '—'}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem;">${m.desc || '—'}</td>
      <td><span class="badge badge-info">${m.um || '—'}</span></td>
      <td style="font-size:.82rem;">${m.category || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;text-align:center;font-weight:700;">${m.ubicBase || '—'}</td>
      <td style="font-size:.82rem;color:var(--text-muted);font-style:italic;">${m.position || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent-gold);">${m.ubicFinal || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;text-align:center;">${m.ubicBase || '—'}</td>
      <td><span class="badge ${m.bodega === 'Bodegas Externas' ? 'badge-info' : 'badge-success'}">${m.bodega || '—'}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${m.lotAlm || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${m.lotProv || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${m.expiry || '—'}</td>
      <td style="text-align:center;font-weight:700;font-size:.95rem;">${m.qty || '—'}</td>
      <td style="text-align:center;">
        <div style="display:inline-flex;gap:.5rem;">
          <button class="btn btn-secondary btn-icon-only" onclick="editDE_Movimiento('${m.id}')" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="btn btn-danger btn-icon-only" onclick="deleteDE_Movimiento('${m.id}')" title="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function setDE_MovFilter(key, value) {
    _deMovFilters[key] = value;

    // Actualizar estado visual de los pills del grupo correspondiente
    document.querySelectorAll(`.de-filter-pills[data-group="${key}"] .de-filter-pill`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === value);
    });

    applyDE_MovFilters();
}

function clearDE_MovDates() {
    _deMovFilters.desde = '';
    _deMovFilters.hasta = '';
    const desdeEl = document.getElementById('de-mov-filter-desde');
    const hastaEl = document.getElementById('de-mov-filter-hasta');
    if (desdeEl) desdeEl.value = '';
    if (hastaEl) hastaEl.value = '';
    applyDE_MovFilters();
    renderDE_Movimientos();
}

function applyDE_MovFilters() {
    const { tipo, estado, bodega, zona, desde, hasta } = _deMovFilters;
    const query = (document.getElementById('de-mov-search')?.value || '').toLowerCase().trim();

    const filtered = state.movements.filter(m => {
        if (tipo !== 'todos' && m.type !== tipo) return false;
        if (estado !== 'todos' && m.status !== estado) return false;
        if (bodega !== 'todas' && m.bodega !== bodega) return false;
        if (zona !== 'todas' && String(m.ubicBase || '') !== zona) return false;
        if (desde) {
            const d = (m.datetime || '').split('T')[0];
            if (d < desde) return false;
        }
        if (hasta) {
            const d = (m.datetime || '').split('T')[0];
            if (d > hasta) return false;
        }
        if (query) {
            return (
                (m.user || '').toLowerCase().includes(query) ||
                (m.doc || '').toLowerCase().includes(query) ||
                (m.materialId || '').toLowerCase().includes(query) ||
                (m.desc || '').toLowerCase().includes(query) ||
                (m.category || '').toLowerCase().includes(query) ||
                (m.lotAlm || '').toLowerCase().includes(query) ||
                (m.lotProv || '').toLowerCase().includes(query) ||
                (m.ubicFinal || '').toLowerCase().includes(query) ||
                String(m.ubicBase || '').includes(query)
            );
        }
        return true;
    });

    const tbody = document.getElementById('de-mov-tbody');
    const counter = document.getElementById('de-mov-count');
    if (tbody) tbody.innerHTML = buildDE_MovRows(filtered);
    if (counter) counter.innerText = `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`;
}

function saveDE_Movimiento(e) {
    e.preventDefault();
    const editId = document.getElementById('de-mov-edit-id').value;
    const mov = {
        id: editId || Date.now().toString(),
        datetime: document.getElementById('de-mov-datetime').value,
        type: document.getElementById('de-mov-type').value,
        status: document.getElementById('de-mov-status').value,
        user: document.getElementById('de-mov-user').value.trim(),
        doc: document.getElementById('de-mov-doc').value.trim(),
        materialId: document.getElementById('de-mov-material').value,
        desc: document.getElementById('de-mov-desc').value.trim(),
        um: document.getElementById('de-mov-um').value.trim(),
        category: document.getElementById('de-mov-category').value.trim(),
        ubicBase: document.getElementById('de-mov-ubic-base').value,
        position: document.getElementById('de-mov-position').value.trim(),
        ubicFinal: document.getElementById('de-mov-ubic-final').value,
        bodega: document.getElementById('de-mov-bodega').value,
        lotAlm: document.getElementById('de-mov-lot-alm').value.trim(),
        lotProv: document.getElementById('de-mov-lot-prov').value.trim(),
        expiry: document.getElementById('de-mov-expiry').value,
        qty: parseInt(document.getElementById('de-mov-qty').value) || 0
    };
    if (editId) {
        const idx = state.movements.findIndex(m => m.id === editId);
        if (idx !== -1) state.movements[idx] = mov;
        triggerToast('success', `Movimiento actualizado correctamente.`);
        _deMovEditId = null;
    } else {
        state.movements.push(mov);
        triggerToast('success', `Movimiento de tipo "${mov.type}" registrado.`);
    }
    saveDEKey('movements');
    renderDE_Movimientos();
}

function editDE_Movimiento(id) {
    _deMovEditId = id;
    renderDE_Movimientos();
    document.getElementById('dataentry-content').scrollIntoView({ behavior: 'smooth' });
}

function cancelDE_MovEdit() {
    _deMovEditId = null;
    renderDE_Movimientos();
}

function deleteDE_Movimiento(id) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    state.movements = state.movements.filter(m => m.id !== id);
    saveDEKey('movements');
    if (_deMovEditId === id) _deMovEditId = null;
    renderDE_Movimientos();
}


// --------------------------------------------------------------------------
//   APARTADO: EN TRÁNSITO
//   Muestra únicamente movimientos con estado = "En Tránsito"
// --------------------------------------------------------------------------
let _deTrSearch = '';

function renderDE_Transito() {
    const records = state.movements.filter(m => m.status === 'En Tránsito');

    const locOptions = state.locations.map(l =>
        `<option value="${l.final || l.base}">`
    ).join('');

    const el = document.getElementById('dataentry-content');
    el.innerHTML = `
    <div class="dataentry-panel">
      <div class="dataentry-section-card">

        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            Movimientos en Tránsito
          </span>
          <div style="display:flex;gap:.75rem;">
            <button class="btn btn-secondary btn-sm" onclick="exportDE_TrCSV()">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
                <path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
                <line x1="9" y1="15" x2="15" y2="15"/><line x1="12" y1="12" x2="12" y2="18"/>
              </svg>
              Exportar CSV
            </button>
            <button class="btn btn-secondary btn-sm" onclick="printDE_TrSoporte()">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Imprimir Soporte
            </button>
          </div>
        </div>

        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1.25rem;">
          Registros automáticos desde <strong style="color:var(--text-secondary);">Movimientos</strong> con estado
          <span class="badge badge-warning">En Tránsito</span>. Para agregar, usa el apartado de Movimientos.
        </p>

        <!-- Datalist de ubicaciones -->
        <datalist id="de-tr-loc-list">${locOptions}</datalist>

        <!-- Búsqueda -->
        <div class="input-wrapper" style="margin-bottom:1.25rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="form-input" id="de-tr-search"
            placeholder="Buscar por fecha, usuario, material, descripción, lote, ubicación..."
            value="${_deTrSearch}"
            oninput="filterDE_Tr(this.value)">
        </div>

        <!-- Tabla -->
        <div class="table-responsive">
          <table class="custom-table">
            <thead><tr>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Usuario</th>
              <th>Material</th>
              <th>Descripción</th>
              <th>Unidad</th>
              <th>Categoría</th>
              <th>UM</th>
              <th>UMB</th>
              <th>Lote Alm.</th>
              <th>Lote Prov.</th>
              <th>F. Fabricación</th>
              <th>F. Vencimiento</th>
              <th style="text-align:center;">Cantidad</th>
              <th style="min-width:160px;">Asignar Ubicación</th>
              <th>Validación</th>
              <th style="text-align:center;">Acción</th>
            </tr></thead>
            <tbody id="de-tr-tbody">
              ${buildDE_TrRows(records)}
            </tbody>
          </table>
        </div>
        <div style="margin-top:.75rem;font-size:.8rem;color:var(--text-muted);" id="de-tr-count">
          ${records.length} registro${records.length !== 1 ? 's' : ''} en tránsito
        </div>

      </div>
    </div>`;
}

function buildDE_TrRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="17" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">No hay movimientos en tránsito.</td></tr>`;
    }

    return [...list].reverse().map(m => {
        const mat = state.materials.find(x => x.id === m.materialId);
        const unidad = mat?.unit || '—';
        const valid = m.transitValidation || 'Pendiente';
        const validBadge = valid === 'Admitido' ? 'badge-success' : 'badge-warning';
        const assigned = m.transitLocation || '';

        return `<tr>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;white-space:nowrap;">${(m.datetime || '').replace('T', ' ')}</td>
          <td><span class="badge badge-warning">En Tránsito</span></td>
          <td style="font-size:.82rem;">${m.user || '—'}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--accent-gold);font-weight:700;">${m.materialId || '—'}</td>
          <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem;">${m.desc || '—'}</td>
          <td style="text-align:center;font-weight:600;">${unidad}</td>
          <td style="font-size:.82rem;">${m.category || '—'}</td>
          <td><span class="badge badge-info">${m.um || '—'}</span></td>
          <td>
            <input type="text" id="de-tr-umb-${m.id}"
              value="${m.transitUMB || ''}"
              class="form-input" placeholder="UMB"
              style="width:72px;padding:.3rem .4rem;font-size:.78rem;font-family:'JetBrains Mono',monospace;">
          </td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${m.lotAlm || '—'}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${m.lotProv || '—'}</td>
          <td>
            <input type="date" id="de-tr-fab-${m.id}"
              value="${m.transitFab || ''}"
              class="form-input"
              style="width:136px;padding:.3rem .4rem;font-size:.78rem;">
          </td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${m.expiry || '—'}</td>
          <td style="text-align:center;font-weight:700;font-size:.95rem;">${m.qty || '—'}</td>
          <td>
            <input type="text" id="de-tr-loc-${m.id}"
              list="de-tr-loc-list"
              value="${assigned}"
              class="form-input" placeholder="Seleccionar o escribir..."
              style="min-width:148px;padding:.3rem .5rem;font-size:.8rem;"
              ${valid === 'Admitido' ? 'style="min-width:148px;padding:.3rem .5rem;font-size:.8rem;border-color:rgba(16,185,129,.4);"' : ''}>
          </td>
          <td>
            <span class="badge ${validBadge}">${valid}</span>
          </td>
          <td style="text-align:center;">
            <button class="btn btn-primary btn-sm" onclick="asignarDE_Tr('${m.id}')"
              style="padding:.35rem .9rem;font-size:.8rem;white-space:nowrap;">
              Asignar
            </button>
          </td>
        </tr>`;
    }).join('');
}

function asignarDE_Tr(movId) {
    const loc = (document.getElementById(`de-tr-loc-${movId}`)?.value || '').trim();
    const umb = (document.getElementById(`de-tr-umb-${movId}`)?.value || '').trim();
    const fab = document.getElementById(`de-tr-fab-${movId}`)?.value || '';

    if (!loc) {
        triggerToast('error', 'Debes ingresar o seleccionar una ubicación antes de asignar.');
        return;
    }

    const idx = state.movements.findIndex(m => m.id === movId);
    if (idx === -1) return;

    state.movements[idx].transitLocation = loc;
    state.movements[idx].transitUMB = umb;
    state.movements[idx].transitFab = fab;
    state.movements[idx].transitValidation = 'Admitido';

    saveDEKey('movements');
    triggerToast('success', `Ubicación "${loc}" asignada — Validación: Admitido.`);
    renderDE_Transito();
}

function filterDE_Tr(query) {
    _deTrSearch = query.toLowerCase().trim();
    const records = state.movements.filter(m => m.status === 'En Tránsito');
    const filtered = _deTrSearch
        ? records.filter(m => {
            const mat = state.materials.find(x => x.id === m.materialId);
            return (
                (m.datetime || '').toLowerCase().includes(_deTrSearch) ||
                (m.user || '').toLowerCase().includes(_deTrSearch) ||
                (m.materialId || '').toLowerCase().includes(_deTrSearch) ||
                (m.desc || '').toLowerCase().includes(_deTrSearch) ||
                (m.category || '').toLowerCase().includes(_deTrSearch) ||
                (m.um || '').toLowerCase().includes(_deTrSearch) ||
                (m.lotAlm || '').toLowerCase().includes(_deTrSearch) ||
                (m.lotProv || '').toLowerCase().includes(_deTrSearch) ||
                (m.transitLocation || '').toLowerCase().includes(_deTrSearch) ||
                (m.transitValidation || '').toLowerCase().includes(_deTrSearch) ||
                (mat?.unit || '').toString().toLowerCase().includes(_deTrSearch)
            );
        })
        : records;

    const tbody = document.getElementById('de-tr-tbody');
    const counter = document.getElementById('de-tr-count');
    if (tbody) tbody.innerHTML = buildDE_TrRows(filtered);
    if (counter) counter.innerText = `${filtered.length} registro${filtered.length !== 1 ? 's' : ''} en tránsito`;
}

function exportDE_TrCSV() {
    const records = state.movements.filter(m => m.status === 'En Tránsito');
    if (records.length === 0) { triggerToast('error', 'No hay registros en tránsito para exportar.'); return; }

    const headers = ['Fecha', 'Estado', 'Usuario', 'Material', 'Descripcion', 'Unidad', 'Categoria', 'UM', 'UMB',
        'LoteAlmacen', 'LoteProveedor', 'F.Fabricacion', 'F.Vencimiento', 'Cantidad',
        'UbicacionAsignada', 'Validacion'];
    const rows = [...records].reverse().map(m => {
        const mat = state.materials.find(x => x.id === m.materialId);
        return [
            `"${(m.datetime || '').replace('T', ' ')}"`,
            'En Tránsito',
            m.user || '',
            m.materialId || '',
            `"${m.desc || ''}"`,
            mat?.unit || '',
            `"${m.category || ''}"`,
            m.um || '',
            m.transitUMB || '',
            m.lotAlm || '',
            m.lotProv || '',
            m.transitFab || '',
            m.expiry || '',
            m.qty || '',
            m.transitLocation || '',
            m.transitValidation || 'Pendiente'
        ];
    });

    const csv = '﻿' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `EnTransito_Aureo_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    triggerToast('success', `CSV exportado (${records.length} registros).`);
}

function printDE_TrSoporte() {
    const records = state.movements.filter(m => m.status === 'En Tránsito');
    if (records.length === 0) { triggerToast('error', 'No hay registros en tránsito para imprimir.'); return; }

    const company = state.settings?.companyName || 'AUREO';
    const printDate = new Date().toLocaleString('es-ES');
    const sorted = [...records].reverse();

    const rows = sorted.map((m, i) => {
        const mat = state.materials.find(x => x.id === m.materialId);
        const valid = m.transitValidation || 'Pendiente';
        return `
        <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
          <td class="center">${i + 1}</td>
          <td class="mono">${(m.datetime || '').replace('T', ' ')}</td>
          <td class="center badge-cell admitido-${valid === 'Admitido'}">${valid}</td>
          <td>${m.user || '—'}</td>
          <td class="mono">${m.materialId || '—'}</td>
          <td>${m.desc || '—'}</td>
          <td class="center">${mat?.unit || '—'}</td>
          <td>${m.category || '—'}</td>
          <td class="center mono">${m.um || '—'}</td>
          <td class="center mono">${m.transitUMB || '—'}</td>
          <td class="mono">${m.lotAlm || '—'}</td>
          <td class="mono">${m.lotProv || '—'}</td>
          <td class="mono">${m.transitFab || '—'}</td>
          <td class="mono">${m.expiry || '—'}</td>
          <td class="center bold">${m.qty || '—'}</td>
          <td class="mono">${m.transitLocation || '_______________'}</td>
        </tr>`;
    }).join('');

    const w = window.open('', '_blank', 'width=1300,height=850');
    w.document.write(`<!DOCTYPE html><html lang="es"><head>
    <meta charset="UTF-8">
    <title>Soporte En Tránsito — ${company}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:Arial,sans-serif;font-size:8.5pt;color:#111;background:#fff;}

      .header{padding:12px 18px 10px;border-bottom:3px solid #111;display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;}
      .header-left h1{font-size:15pt;font-weight:800;letter-spacing:1px;}
      .header-left h2{font-size:9.5pt;font-weight:400;color:#555;margin-top:2px;}
      .header-right{text-align:right;font-size:7.5pt;color:#555;line-height:1.7;}
      .header-right strong{color:#111;font-size:8.5pt;}

      .badge-tr{display:inline-block;background:#fef3c7;border:1px solid #d97706;color:#92400e;padding:1px 8px;border-radius:3px;font-size:7.5pt;font-weight:700;text-transform:uppercase;}

      table{width:100%;border-collapse:collapse;}
      thead tr{background:#111;color:#fff;}
      thead th{padding:5px 4px;text-align:left;font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;border-right:1px solid #333;}
      thead th:last-child{border-right:none;}

      tbody tr.even{background:#f9fafb;}
      tbody tr.odd{background:#fff;}
      td{padding:4px 4px;font-size:7.5pt;border-bottom:1px solid #e5e7eb;border-right:1px solid #f3f4f6;vertical-align:middle;}
      td:last-child{border-right:none;}

      .mono{font-family:'Courier New',monospace;font-size:7pt;}
      .center{text-align:center;}
      .bold{font-weight:700;}
      .badge-cell{font-weight:700;color:#92400e;}
      .admitido-true{color:#065f46 !important;}

      .sig-block{margin-top:28px;display:flex;gap:50px;}
      .sig-line{flex:1;border-top:1px solid #9ca3af;padding-top:4px;font-size:7.5pt;color:#6b7280;}
      .footer{margin-top:12px;padding-top:7px;border-top:1px solid #d1d5db;display:flex;justify-content:space-between;font-size:7pt;color:#9ca3af;}

      @media print{
        @page{size:landscape;margin:8mm 6mm;}
        thead tr{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
        tbody tr.even{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      }
    </style></head><body>

    <div class="header">
      <div class="header-left">
        <h1>${company}</h1>
        <h2>Soporte de Movimientos — <span class="badge-tr">En Tránsito</span></h2>
      </div>
      <div class="header-right">
        <strong>Emisión:</strong> ${printDate}<br>
        <strong>Total registros:</strong> ${sorted.length}<br>
        <strong>Doc:</strong> VF-TR-${Date.now().toString().slice(-6)}
      </div>
    </div>

    <table>
      <thead><tr>
        <th style="width:24px;">#</th>
        <th style="width:108px;">Fecha</th>
        <th style="width:68px;">Validación</th>
        <th style="width:62px;">Usuario</th>
        <th style="width:68px;">Material</th>
        <th style="width:140px;">Descripción</th>
        <th style="width:42px;">Unidad</th>
        <th style="width:88px;">Categoría</th>
        <th style="width:32px;">UM</th>
        <th style="width:36px;">UMB</th>
        <th style="width:60px;">Lote Alm.</th>
        <th style="width:60px;">Lote Prov.</th>
        <th style="width:72px;">F. Fabricación</th>
        <th style="width:72px;">F. Vencimiento</th>
        <th style="width:38px;">Cant.</th>
        <th style="width:100px;">Ubicación Asig.</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="sig-block">
      <div class="sig-line">Elaborado por: _________________________ &nbsp; Nombre y Firma</div>
      <div class="sig-line">Revisado por: _________________________ &nbsp; Nombre y Firma</div>
      <div class="sig-line">Fecha de entrega: _____________________</div>
    </div>

    <div class="footer">
      <span>Generado por AUREO · Sistema de Gestión de Ferretería</span>
      <span>Documento de uso interno — no válido como comprobante fiscal</span>
    </div>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
    triggerToast('success', 'Soporte enviado a impresión.');
}

// --------------------------------------------------------------------------
//   APARTADO: HISTORIAL DE RÓTULOS
// --------------------------------------------------------------------------
let _deRotSearch = '';
let _deRotSerial = '';

function _getWeekNumber(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const start = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
    return `S${String(week).padStart(2, '0')}-${d.getFullYear()}`;
}

function renderDE_Rotulos() {
    const el = document.getElementById('dataentry-content');
    el.innerHTML = `
    <div class="dataentry-panel">

      <!-- TABLA -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">Historial de Rótulos</span>
          <span class="badge badge-info" id="de-rot-count">${state.labels.length} registros</span>
        </div>

        <!-- Barra de búsqueda y acciones -->
        <div class="de-rot-searchbar">
          <!-- Búsqueda manual -->
          <div class="input-wrapper" style="flex:1;min-width:220px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" class="form-input" id="de-rot-search"
              placeholder="Buscar por proveedor, SKU, texto breve, documento, lote, semana..."
              value="${_deRotSearch}"
              onkeydown="if(event.key==='Enter') applyDE_RotFilters()">
          </div>

          <!-- Filtro por Serial Impresión -->
          <div style="display:flex;flex-direction:column;gap:.25rem;min-width:180px;">
            <span style="font-size:.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">Serial Impresión</span>
            <input type="text" class="form-input" id="de-rot-serial-filter"
              placeholder="Ej: SER-0001"
              value="${_deRotSerial}"
              style="font-family:'JetBrains Mono',monospace;font-size:.85rem;"
              onkeydown="if(event.key==='Enter') applyDE_RotFilters()">
          </div>

          <!-- Botones de acción -->
          <div style="display:flex;align-items:flex-end;gap:.6rem;">
            <button class="btn btn-primary" onclick="applyDE_RotFilters()">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Buscar
            </button>
            <button class="btn btn-secondary" onclick="clearDE_RotFilters()">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Limpiar filtros
            </button>
            <button class="btn btn-secondary" onclick="exportDE_RotCSV()">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
                <path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
                <line x1="9" y1="15" x2="15" y2="15"/><line x1="12" y1="12" x2="12" y2="18"/>
              </svg>
              Exportar CSV
            </button>
          </div>
        </div>

        <div class="table-responsive">
          <table class="custom-table">
            <thead><tr>
              <th>Serial Imp.</th>
              <th>Serial Cita</th>
              <th>Fecha Rec.</th>
              <th>Semana</th>
              <th>Proveedor</th>
              <th>Auxiliar</th>
              <th>Documento</th>
              <th>Remesa</th>
              <th>Orden Compra</th>
              <th style="text-align:center;">Cantidad</th>
              <th>SKU</th>
              <th>Texto Breve</th>
              <th>UM</th>
              <th>UMB</th>
              <th>F. Fabricación</th>
              <th>F. Vencimiento</th>
              <th>Lote Prov.</th>
              <th>Lote Alm.</th>
              <th style="text-align:center;">Acción</th>
            </tr></thead>
            <tbody id="de-rot-tbody">
              ${buildDE_RotRows(state.labels)}
            </tbody>
          </table>
        </div>
      </div>

    </div>`;
}

function printDE_RotLabel(id) {
    const l = state.labels.find(x => x.id === id);
    if (!l) return;
    // Formato de impresión pendiente — se definirá en próxima iteración
    triggerToast('notif', `Impresión de rótulo "${l.serialImp}" — formato en configuración.`);
}

function buildDE_RotRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="19" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">Sin rótulos registrados.</td></tr>`;
    }
    return [...list].reverse().map(l => `
    <tr>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;font-weight:700;color:var(--accent-gold);">${l.serialImp || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.serialCita || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.fechaRec || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;font-weight:600;">${l.semana || '—'}</td>
      <td style="font-size:.82rem;">${l.proveedor || '—'}</td>
      <td style="font-size:.82rem;">${l.auxiliar || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.documento || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.remesa || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.ordenCompra || '—'}</td>
      <td style="text-align:center;font-weight:700;">${l.cantidad || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.sku || '—'}</td>
      <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem;">${l.textoBreve || '—'}</td>
      <td><span class="badge badge-info">${l.um || '—'}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.umb || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.fFabricacion || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.fVencimiento || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.loteProv || '—'}</td>
      <td>
        <div style="display:inline-flex;align-items:center;gap:.5rem;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.loteAlm || '—'}</span>
          <button class="btn btn-secondary btn-icon-only" onclick="printDE_RotLabel('${l.id}')" title="Imprimir rótulo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
          </button>
        </div>
      </td>
      <td style="text-align:center;">
        <button class="btn btn-danger btn-icon-only" onclick="deleteDE_Rotulo('${l.id}')" title="Eliminar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </td>
    </tr>`).join('');
}

// Predicado de filtro compartido entre la tabla en pantalla y la exportación,
// para que "Exportar CSV" siempre refleje exactamente lo que se está viendo.
function _getFilteredDERotulos() {
    return state.labels.filter(l => {
        if (_deRotSerial && !(l.serialImp || '').toLowerCase().includes(_deRotSerial)) return false;
        if (_deRotSearch) {
            return (
                (l.serialCita || '').toLowerCase().includes(_deRotSearch) ||
                (l.semana || '').toLowerCase().includes(_deRotSearch) ||
                (l.proveedor || '').toLowerCase().includes(_deRotSearch) ||
                (l.auxiliar || '').toLowerCase().includes(_deRotSearch) ||
                (l.documento || '').toLowerCase().includes(_deRotSearch) ||
                (l.remesa || '').toLowerCase().includes(_deRotSearch) ||
                (l.ordenCompra || '').toLowerCase().includes(_deRotSearch) ||
                (l.sku || '').toLowerCase().includes(_deRotSearch) ||
                (l.textoBreve || '').toLowerCase().includes(_deRotSearch) ||
                (l.loteProv || '').toLowerCase().includes(_deRotSearch) ||
                (l.loteAlm || '').toLowerCase().includes(_deRotSearch) ||
                (l.fechaRec || '').includes(_deRotSearch)
            );
        }
        return true;
    });
}

function applyDE_RotFilters() {
    _deRotSearch = (document.getElementById('de-rot-search')?.value || '').toLowerCase().trim();
    _deRotSerial = (document.getElementById('de-rot-serial-filter')?.value || '').toLowerCase().trim();

    const filtered = _getFilteredDERotulos();

    const tbody = document.getElementById('de-rot-tbody');
    const counter = document.getElementById('de-rot-count');
    if (tbody) tbody.innerHTML = buildDE_RotRows(filtered);
    if (counter) counter.innerText = `${filtered.length} ${(_deRotSearch || _deRotSerial) ? 'resultado' + (filtered.length !== 1 ? 's' : '') : 'registros'}`;
}

function clearDE_RotFilters() {
    _deRotSearch = '';
    _deRotSerial = '';
    const searchEl = document.getElementById('de-rot-search');
    const serialEl = document.getElementById('de-rot-serial-filter');
    if (searchEl) searchEl.value = '';
    if (serialEl) serialEl.value = '';

    const tbody = document.getElementById('de-rot-tbody');
    const counter = document.getElementById('de-rot-count');
    if (tbody) tbody.innerHTML = buildDE_RotRows(state.labels);
    if (counter) counter.innerText = `${state.labels.length} registros`;
}

function exportDE_RotCSV() {
    if (!_ensureXLSX()) return;

    const filtered = _getFilteredDERotulos();
    if (filtered.length === 0) {
        triggerToast('error', 'No hay rótulos para exportar con los filtros actuales.');
        return;
    }

    const headers = ['Serial Imp.', 'Serial Cita', 'Fecha Rec.', 'Semana', 'Proveedor', 'Auxiliar', 'Documento', 'Remesa', 'Orden de Compra', 'Cantidad', 'SKU', 'Texto Breve', 'UM', 'UMB', 'F. Fabricación', 'F. Vencimiento', 'Lote Proveedor', 'Lote Almacén'];
    const rows = [...filtered].reverse().map(l => [
        l.serialImp || '', l.serialCita || '', l.fechaRec || '', l.semana || '', l.proveedor || '',
        l.auxiliar || '', l.documento || '', l.remesa || '', l.ordenCompra || '', l.cantidad || '',
        l.sku || '', l.textoBreve || '', l.um || '', l.umb || '', l.fFabricacion || '', l.fVencimiento || '',
        l.loteProv || '', l.loteAlm || ''
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rotulos');
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `AUREO_Rotulos_${dateStr}.xlsx`);

    triggerToast('success', `Rótulos exportados correctamente (${filtered.length} registros).`);
}


function deleteDE_Rotulo(id) {
    const l = state.labels.find(l => l.id === id);
    if (!l) return;
    if (!confirm(`¿Eliminar rótulo "${l.serialImp}"?`)) return;
    state.labels = state.labels.filter(l => l.id !== id);
    saveDEKey('labels');
    if (_deRotEditId === id) _deRotEditId = null;
    renderDE_Rotulos();
}

