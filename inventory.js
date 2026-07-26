// AUREO — MÓDULO: INVENTARIO (conteos, conciliación, recuentos)

// ==========================================================================
//   MÓDULO: INVENTARIO
// ==========================================================================

const INV_SUBS = [
    { id: 'panel', label: 'Panel de inventarios', icon: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>' },
    { id: 'crear-tarea', label: 'Crear tarea', icon: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' },
    { id: 'mis-conteos', label: 'Mis conteos', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' },
    { id: 'conteos', label: 'Conteos físicos', icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
    { id: 'conciliacion', label: 'Conciliación', icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
    { id: 'reconteos', label: 'Reconteos', icon: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>' },
    { id: 'informe', label: 'Informe inventario', icon: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="15" y2="11"/>' }
];

let activeInventarioSub = null;

function renderInventario() {
    const tabsContainer = document.getElementById('inventario-tabs');
    tabsContainer.innerHTML = INV_SUBS.map(sub => `
        <button class="dataentry-tab-btn ${activeInventarioSub === sub.id ? 'active' : ''}"
            onclick="switchInventarioSub('${sub.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                ${sub.icon}
            </svg>
            ${sub.label}
        </button>
    `).join('');

    if (activeInventarioSub) {
        switchInventarioSub(activeInventarioSub);
    }
}

function switchInventarioSub(subId) {
    activeInventarioSub = subId;
    const sub = INV_SUBS.find(s => s.id === subId);

    document.querySelectorAll('#inventario-tabs .dataentry-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === sub.label);
    });

    const content = document.getElementById('inventario-content');

    if (subId === 'panel') {
        const tareasActivas = (state.invTareas || []).filter(t => t.estado === 'activa').length;
        const pendientesConcil = (state.invConteos || []).filter(c => c.estado === 'pendiente').length;
        const reconteosAbiertos = (state.invReconteos || []).filter(r => r.estado === 'abierto').length;
        const diferencias = tareasActivas + pendientesConcil + reconteosAbiertos;

        content.innerHTML = `
            <div style="margin-top: 1.5rem;">
                <div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
                    <button class="btn btn-primary" onclick="switchInventarioSub('informe')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="margin-right: 0.4rem;">
                            <path d="M14 3v4a1 1 0 0 0 1 1h4"/>
                            <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
                            <line x1="9" y1="15" x2="15" y2="15"/>
                            <line x1="9" y1="11" x2="15" y2="11"/>
                        </svg>
                        Ver informes
                    </button>
                    <button class="btn btn-secondary" onclick="switchInventarioSub('crear-tarea')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="margin-right: 0.4rem;">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Nueva tarea
                    </button>
                </div>

                <div class="stats-grid">
                    <div class="card stat-card stat-emerald">
                        <div class="stat-header">
                            <span class="stat-title">Tareas activas</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M9 11l3 3L22 4"/>
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${tareasActivas}</div>
                        <div class="stat-meta">
                            <span class="stat-trend up">En ejecución</span>
                            <span class="stat-period">tareas de conteo</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-cyan">
                        <div class="stat-header">
                            <span class="stat-title">Pendientes conciliación</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="18" y1="20" x2="18" y2="10"/>
                                    <line x1="12" y1="20" x2="12" y2="4"/>
                                    <line x1="6" y1="20" x2="6" y2="14"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${pendientesConcil}</div>
                        <div class="stat-meta">
                            <span class="stat-trend neutral">Requieren revisión</span>
                            <span class="stat-period">por conciliar</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-gold">
                        <div class="stat-header">
                            <span class="stat-title">Reconteos abiertos</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="17 1 21 5 17 9"/>
                                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                    <polyline points="7 23 3 19 7 15"/>
                                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${reconteosAbiertos}</div>
                        <div class="stat-meta">
                            <span class="stat-trend neutral">Pendientes</span>
                            <span class="stat-period">reconteos activos</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-rose">
                        <div class="stat-header">
                            <span class="stat-title">Diferencias detectadas</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                    <line x1="12" y1="9" x2="12" y2="13"/>
                                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${diferencias}</div>
                        <div class="stat-meta">
                            <span class="stat-trend ${diferencias > 0 ? 'down' : 'up'}">${diferencias > 0 ? 'Requieren atención' : 'Sin diferencias'}</span>
                            <span class="stat-period">total acumulado</span>
                        </div>
                    </div>
                </div>

                <div class="card" style="margin-top: 2rem;">
                    <div class="card-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                        <h2 class="card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                            </svg>
                            Últimas tareas de inventario
                        </h2>
                    </div>
                    <div class="table-responsive" style="margin-top: 0;">
                        <table class="custom-table" style="font-size: 0.85rem;">
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Tipo</th>
                                    <th>Ubicación</th>
                                    <th>Estado</th>
                                    <th>Responsable</th>
                                    <th>Fecha</th>
                                </tr>
                            </thead>
                            <tbody id="inv-panel-tabla">
                                ${(() => {
                const tareas = (state.invTareas || []).slice(-10).reverse();
                if (tareas.length === 0) return `
                                        <tr>
                                            <td colspan="6" style="text-align:center; color:var(--text-secondary); padding: 2rem;">
                                                No hay tareas registradas.
                                            </td>
                                        </tr>`;
                return tareas.map(t => `
                                        <tr>
                                            <td><span class="badge badge-info">${t.codigo || '—'}</span></td>
                                            <td>${t.tipo || '—'}</td>
                                            <td>${t.ubicacion || '—'}</td>
                                            <td><span class="badge ${t.estado === 'activa' ? 'badge-success' : t.estado === 'pendiente' ? 'badge-warning' : 'badge-info'}">${t.estado || '—'}</span></td>
                                            <td>${t.responsable || '—'}</td>
                                            <td>${t.fecha || '—'}</td>
                                        </tr>`).join('');
            })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    if (subId === 'crear-tarea') {
        content.innerHTML = `
            <div class="resp-grid-2-900" style="margin-top: 1.5rem; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start;">

                <!-- Creación de orden -->
                <div class="card">
                    <div class="card-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                        <h2 class="card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"/>
                                <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            Creación de orden
                        </h2>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Código</label>
                        <input type="text" class="form-input" id="inv-tarea-codigo" placeholder="Auto-generado" readonly
                            style="opacity: 0.6; cursor: default;">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Tipo de conteo</label>
                        <select class="form-select" id="inv-tarea-tipo" onchange="invActualizarResumen()">
                            <option value="">— Seleccionar —</option>
                            <option value="Zona">Zona</option>
                            <option value="Familia">Familia</option>
                            <option value="Material">Material</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Zona</label>
                        <input type="text" class="form-input" id="inv-tarea-zona"
                            placeholder="Ej: Bodega Principal - Pasillo A" oninput="invActualizarResumen()">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Asignado a</label>
                        <input type="text" class="form-input" id="inv-tarea-asignado"
                            placeholder="Nombre del responsable" oninput="invActualizarResumen()">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Creado por</label>
                        <input type="text" class="form-input" id="inv-tarea-creadopor"
                            placeholder="Nombre de quien crea la tarea" oninput="invActualizarResumen()">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Observación</label>
                        <textarea class="form-input" id="inv-tarea-obs" rows="3"
                            placeholder="Notas adicionales sobre la tarea..." oninput="invActualizarResumen()"
                            style="resize: vertical; font-family: inherit;"></textarea>
                    </div>

                    <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
                        <button class="btn btn-primary" onclick="invGuardarTarea()" style="flex: 1;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="margin-right: 0.4rem;">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                <polyline points="17 21 17 13 7 13 7 21"/>
                                <polyline points="7 3 7 8 15 8"/>
                            </svg>
                            Guardar tarea
                        </button>
                        <button class="btn btn-secondary" onclick="invLimpiarFormTarea()">
                            Limpiar
                        </button>
                    </div>
                </div>

                <!-- Resumen operativo -->
                <div class="card" id="inv-resumen-card">
                    <div class="card-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                        <h2 class="card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 3v4a1 1 0 0 0 1 1h4"/>
                                <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
                                <line x1="9" y1="15" x2="15" y2="15"/>
                                <line x1="9" y1="11" x2="15" y2="11"/>
                            </svg>
                            Resumen operativo
                        </h2>
                        <span class="badge badge-info" id="inv-resumen-badge">Borrador</span>
                    </div>
                    <div id="inv-resumen-body">
                        <div style="text-align: center; color: var(--text-secondary); padding: 3rem 1rem; font-size: 0.88rem;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                                stroke-linecap="round" stroke-linejoin="round" width="40" height="40"
                                style="display: block; margin: 0 auto 1rem; opacity: 0.35;">
                                <path d="M14 3v4a1 1 0 0 0 1 1h4"/>
                                <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
                            </svg>
                            Completa el formulario para ver el resumen de la tarea.
                        </div>
                    </div>
                </div>

            </div>
        `;

        const codigo = 'INV-' + String((state.invTareas || []).length + 1).padStart(4, '0');
        document.getElementById('inv-tarea-codigo').value = codigo;
        invActualizarResumen();
        return;
    }

    if (subId === 'mis-conteos') {
        const tareas = state.invTareas || [];
        const total = tareas.length;
        const pendientes = tareas.filter(t => t.estado === 'pendiente').length;
        const enProceso = tareas.filter(t => t.estado === 'activa').length;
        const reconteos = (state.invReconteos || []).length;

        content.innerHTML = `
            <div style="margin-top: 1.5rem;">
                <div class="stats-grid">
                    <div class="card stat-card stat-cyan">
                        <div class="stat-header">
                            <span class="stat-title">Total de tareas</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${total}</div>
                        <div class="stat-meta">
                            <span class="stat-trend neutral">Registradas</span>
                            <span class="stat-period">en el sistema</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-gold">
                        <div class="stat-header">
                            <span class="stat-title">Pendientes</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polyline points="12 6 12 12 16 14"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${pendientes}</div>
                        <div class="stat-meta">
                            <span class="stat-trend ${pendientes > 0 ? 'down' : 'up'}">${pendientes > 0 ? 'Por iniciar' : 'Al día'}</span>
                            <span class="stat-period">tareas pendientes</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-emerald">
                        <div class="stat-header">
                            <span class="stat-title">En proceso</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M9 11l3 3L22 4"/>
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${enProceso}</div>
                        <div class="stat-meta">
                            <span class="stat-trend up">Activas</span>
                            <span class="stat-period">en ejecución</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-rose">
                        <div class="stat-header">
                            <span class="stat-title">Reconteos</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="17 1 21 5 17 9"/>
                                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                    <polyline points="7 23 3 19 7 15"/>
                                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${reconteos}</div>
                        <div class="stat-meta">
                            <span class="stat-trend ${reconteos > 0 ? 'down' : 'up'}">${reconteos > 0 ? 'Requieren revisión' : 'Sin reconteos'}</span>
                            <span class="stat-period">abiertos</span>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display:flex; gap:1.25rem; margin-top:1.5rem; align-items:flex-start; flex-wrap:wrap;">

                <!-- CONSULTA -->
                <div class="card" style="flex:1; min-width:0;">
                    <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                        <h2 class="card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            Consulta de tareas
                        </h2>
                    </div>
                    <div class="table-controls" style="margin-bottom:1rem; flex-wrap:wrap; gap:0.6rem;">
                        <div class="input-wrapper" style="flex:1; min-width:160px;">
                            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                            <input type="text" class="form-input" id="mc-buscar-asignado" placeholder="Asignado a...">
                        </div>
                        <div style="min-width:170px;">
                            <select class="form-select" id="mc-filtro-estado">
                                <option value="todos">Todos los estados</option>
                                <option value="pendiente">Pendiente</option>
                                <option value="en proceso">En proceso</option>
                                <option value="reconteo pendiente">Reconteo pendiente</option>
                                <option value="conciliada">Conciliada</option>
                                <option value="cerrada">Cerrada</option>
                            </select>
                        </div>
                        <button class="btn btn-primary" onclick="filtrarMisConteos()" style="white-space:nowrap;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            Buscar
                        </button>
                        <button class="btn btn-secondary" onclick="recargarMisConteos()" style="white-space:nowrap;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
                            </svg>
                            Recargar
                        </button>
                    </div>
                    <div class="table-responsive">
                        <table class="custom-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Tipo</th>
                                    <th>Criterio</th>
                                    <th>Asignado</th>
                                    <th>Estado</th>
                                    <th>Reconteo</th>
                                </tr>
                            </thead>
                            <tbody id="mc-tabla-body"></tbody>
                        </table>
                    </div>
                </div>

                <!-- DETALLE RÁPIDO -->
                <div class="card" style="width:300px; flex-shrink:0; position:sticky; top:80px;">
                    <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                        <h2 class="card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            Detalle rápido
                        </h2>
                    </div>
                    <div id="mc-detalle-panel">
                        <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-muted);">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
                                style="width:40px;height:40px; margin:0 auto 0.75rem; display:block; opacity:0.35;">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                                <polyline points="10 9 9 9 8 9"/>
                            </svg>
                            <p style="font-size:0.85rem;">Selecciona una tarea<br>para ver el detalle</p>
                        </div>
                    </div>
                </div>

            </div>
        `;
        filtrarMisConteos();
        return;
    }

    if (subId === 'conteos') {
        content.innerHTML = `
            <div style="margin-top:1.5rem;">

                <!-- Tarjetas de resumen -->
                <div class="stats-grid" style="margin-bottom:1.5rem;">
                    <div class="card stat-card stat-emerald">
                        <div class="stat-header">
                            <span class="stat-title">Total conteos</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${(state.invConteos || []).length}</div>
                        <div class="stat-meta"><span class="stat-trend up">Registrados</span></div>
                    </div>
                    <div class="card stat-card stat-cyan">
                        <div class="stat-header">
                            <span class="stat-title">En proceso</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${(state.invConteos || []).filter(c => c.estado === 'en proceso').length}</div>
                        <div class="stat-meta"><span class="stat-trend up">Activos</span></div>
                    </div>
                    <div class="card stat-card stat-amber">
                        <div class="stat-header">
                            <span class="stat-title">Pendientes</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${(state.invConteos || []).filter(c => c.estado === 'pendiente').length}</div>
                        <div class="stat-meta"><span class="stat-trend down">Sin finalizar</span></div>
                    </div>
                    <div class="card stat-card stat-rose">
                        <div class="stat-header">
                            <span class="stat-title">Completados</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${(state.invConteos || []).filter(c => c.estado === 'completado').length}</div>
                        <div class="stat-meta"><span class="stat-trend up">Finalizados</span></div>
                    </div>
                </div>

                <!-- Consulta de conteos -->
                <div class="card">
                    <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                        <h2 class="card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            Consulta de conteos
                        </h2>
                    </div>

                    <div class="table-controls" style="margin-bottom:1rem; flex-wrap:wrap; gap:0.6rem;">
                        <div class="input-wrapper" style="flex:1; min-width:160px;">
                            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            <input type="text" class="form-input" id="cf-buscar-id"
                                placeholder="ID de tarea...">
                        </div>
                        <div class="input-wrapper" style="flex:1; min-width:160px;">
                            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                            <input type="text" class="form-input" id="cf-buscar-usuario"
                                placeholder="Usuario que registra...">
                        </div>
                        <button class="btn btn-primary" onclick="filtrarConteosF()" style="white-space:nowrap;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            Buscar
                        </button>
                        <button class="btn btn-secondary" onclick="recargarConteosF()" style="white-space:nowrap;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
                            </svg>
                            Recargar
                        </button>
                    </div>

                    <div class="table-responsive">
                        <table class="custom-table" style="font-size:0.82rem;">
                            <thead>
                                <tr>
                                    <th>Detalle</th>
                                    <th>Ubicación</th>
                                    <th>Zona</th>
                                    <th>Cód. Material</th>
                                    <th>Descripción</th>
                                    <th>Lote Almacén</th>
                                    <th>Lote Proveedor</th>
                                    <th>FV</th>
                                    <th>Cant. Contada</th>
                                    <th>Observación</th>
                                </tr>
                            </thead>
                            <tbody id="cf-tabla-body"></tbody>
                        </table>
                    </div>

                    <!-- Botones de acción -->
                    <div style="display:flex; gap:0.75rem; margin-top:1.5rem; flex-wrap:wrap;">
                        <button class="btn btn-secondary" onclick="switchInventarioSub('mis-conteos')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <polyline points="15 18 9 12 15 6"/>
                            </svg>
                            Volver a mis conteos
                        </button>
                        <button class="btn btn-primary" onclick="guardarConteoF()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                <polyline points="17 21 17 13 7 13 7 21"/>
                                <polyline points="7 3 7 8 15 8"/>
                            </svg>
                            Guardar conteo
                        </button>
                        <button class="btn btn-secondary" onclick="switchInventarioSub('conciliacion')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <line x1="18" y1="20" x2="18" y2="10"/>
                                <line x1="12" y1="20" x2="12" y2="4"/>
                                <line x1="6" y1="20" x2="6" y2="14"/>
                            </svg>
                            Ir a conciliación
                        </button>
                    </div>
                </div>

            </div>
        `;
        filtrarConteosF();
        return;
    }

    if (subId === 'conciliacion') {
        const conteos = state.invConteos || [];
        const tareas = state.invTareas || [];
        const totalItems = conteos.length;
        const sinDiferencia = conteos.filter(c => (c.cantidadContada ?? 0) === (c.cantidadSistema ?? 0)).length;
        const conDiferencia = conteos.filter(c => (c.cantidadContada ?? 0) !== (c.cantidadSistema ?? 0)).length;
        const pendConcil = conteos.filter(c => c.estado === 'pendiente').length;

        content.innerHTML = `
            <div style="margin-top:1.5rem;">

                <!-- Resumen -->
                <div class="stats-grid" style="margin-bottom:1.5rem;">
                    <div class="card stat-card stat-emerald">
                        <div class="stat-header">
                            <span class="stat-title">Total ítems</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                                    <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                                    <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${totalItems}</div>
                        <div class="stat-meta"><span class="stat-trend up">En conciliación</span></div>
                    </div>
                    <div class="card stat-card stat-cyan">
                        <div class="stat-header">
                            <span class="stat-title">Sin diferencia</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${sinDiferencia}</div>
                        <div class="stat-meta"><span class="stat-trend up">Cuadran</span></div>
                    </div>
                    <div class="card stat-card stat-rose">
                        <div class="stat-header">
                            <span class="stat-title">Con diferencia</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/>
                                    <line x1="9" y1="9" x2="15" y2="15"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${conDiferencia}</div>
                        <div class="stat-meta"><span class="stat-trend down">Requieren acción</span></div>
                    </div>
                    <div class="card stat-card stat-amber">
                        <div class="stat-header">
                            <span class="stat-title">Pend. conciliación</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${pendConcil}</div>
                        <div class="stat-meta"><span class="stat-trend down">Sin resolver</span></div>
                    </div>
                </div>

                <!-- Tabla comparativa -->
                <div class="card">
                    <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                        <h2 class="card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                            </svg>
                            Comparativo Sistema vs Físico
                        </h2>
                    </div>

                    <!-- Filtros -->
                    <div class="table-controls" style="margin-bottom:1rem; flex-wrap:wrap; gap:0.6rem;">
                        <div class="input-wrapper" style="flex:1; min-width:150px;">
                            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            <input type="text" class="form-input" id="conc-buscar-tarea"
                                placeholder="ID de tarea...">
                        </div>
                        <div class="input-wrapper" style="flex:1; min-width:150px;">
                            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                            <input type="text" class="form-input" id="conc-buscar-usuario"
                                placeholder="Usuario que finaliza...">
                        </div>
                        <div class="input-wrapper" style="flex:1; min-width:150px;">
                            <svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                            <input type="text" class="form-input" id="conc-buscar-reconteo"
                                placeholder="Asignado a reconteo (opcional)...">
                        </div>
                        <button class="btn btn-primary" onclick="filtrarConciliacion()" style="white-space:nowrap;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            Buscar
                        </button>
                        <button class="btn btn-secondary" onclick="recargarConciliacion()" style="white-space:nowrap;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
                            </svg>
                            Recargar
                        </button>
                    </div>

                    <div class="table-responsive">
                        <table class="custom-table" style="font-size:0.82rem;">
                            <thead>
                                <tr>
                                    <th>Detalle</th>
                                    <th>Ubicación</th>
                                    <th>Código</th>
                                    <th>Descripción</th>
                                    <th>Lote Almacén</th>
                                    <th>Lote Proveedor</th>
                                    <th>Sistema</th>
                                    <th>Contado</th>
                                    <th>Diferencia</th>
                                    <th>Coincide</th>
                                    <th>Observación</th>
                                </tr>
                            </thead>
                            <tbody id="conc-tabla-body"></tbody>
                        </table>
                    </div>

                    <!-- Botones de cierre -->
                    <div style="display:flex; gap:0.75rem; margin-top:1.5rem; flex-wrap:wrap; align-items:center;">
                        <button class="btn btn-secondary" onclick="switchInventarioSub('conteos')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <polyline points="15 18 9 12 15 6"/>
                            </svg>
                            Volver a conteos
                        </button>
                        <div style="flex:1;"></div>
                        <button class="btn btn-secondary" onclick="generarReconteoAuto()" style="border-color:var(--accent-amber,#f59e0b); color:var(--accent-amber,#f59e0b);">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                            </svg>
                            Generar reconteo automático
                        </button>
                        <button class="btn btn-primary" onclick="cerrarTareaConciliacion()" style="background:var(--accent-emerald,#10b981); border-color:var(--accent-emerald,#10b981);">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Cerrar tarea
                        </button>
                    </div>
                </div>

            </div>
        `;
        filtrarConciliacion();
        return;
    }

    if (subId === 'reconteos') {
        const reconteos = state.invReconteos || [];
        const total = reconteos.length;
        const pendientes = reconteos.filter(r => r.estado === 'abierto' || r.estado === 'pendiente').length;
        const enProceso = reconteos.filter(r => r.estado === 'en proceso').length;
        const cerrados = reconteos.filter(r => r.estado === 'cerrado').length;

        content.innerHTML = `
            <div style="margin-top:1.5rem;">

                <div class="stats-grid" style="margin-bottom:1.5rem;">
                    <div class="card stat-card stat-cyan">
                        <div class="stat-header">
                            <span class="stat-title">Total reconteos</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="17 1 21 5 17 9"/>
                                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                    <polyline points="7 23 3 19 7 15"/>
                                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${total}</div>
                        <div class="stat-meta">
                            <span class="stat-trend neutral">Generados</span>
                            <span class="stat-period">desde conciliación</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-amber">
                        <div class="stat-header">
                            <span class="stat-title">Pendientes</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polyline points="12 6 12 12 16 14"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${pendientes}</div>
                        <div class="stat-meta">
                            <span class="stat-trend ${pendientes > 0 ? 'down' : 'up'}">${pendientes > 0 ? 'Sin iniciar' : 'Al día'}</span>
                            <span class="stat-period">por ejecutar</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-gold">
                        <div class="stat-header">
                            <span class="stat-title">En proceso</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="12" y1="2" x2="12" y2="6"/>
                                    <line x1="12" y1="18" x2="12" y2="22"/>
                                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
                                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
                                    <line x1="2" y1="12" x2="6" y2="12"/>
                                    <line x1="18" y1="12" x2="22" y2="12"/>
                                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
                                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${enProceso}</div>
                        <div class="stat-meta">
                            <span class="stat-trend neutral">En ejecución</span>
                            <span class="stat-period">conteos activos</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-emerald">
                        <div class="stat-header">
                            <span class="stat-title">Cerrados</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${cerrados}</div>
                        <div class="stat-meta">
                            <span class="stat-trend up">Finalizados</span>
                            <span class="stat-period">conciliados</span>
                        </div>
                    </div>
                </div>

                <!-- Dos columnas -->
                <div style="display:flex; gap:1.25rem; align-items:flex-start;">

                    <!-- IZQUIERDA: Consulta de reconteos -->
                    <div class="card" style="flex:1; min-width:0;">
                        <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                            <h2 class="card-title">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                Consulta de reconteos
                            </h2>
                        </div>

                        <div style="display:flex; gap:0.6rem; margin-bottom:1rem; flex-wrap:wrap;">
                            <div class="input-wrapper" style="flex:1; min-width:140px;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                                </svg>
                                <input type="text" class="form-input" id="rc-buscar-asignado" placeholder="Asignado a...">
                            </div>
                            <div style="min-width:155px;">
                                <select class="form-select" id="rc-filtro-estado">
                                    <option value="todos">Todos los estados</option>
                                    <option value="pendiente">Pendiente</option>
                                    <option value="en proceso">En proceso</option>
                                    <option value="conciliada">Conciliada</option>
                                    <option value="cerrada">Cerrada</option>
                                </select>
                            </div>
                            <button class="btn btn-primary" onclick="filtrarReconteos()" style="white-space:nowrap;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                Buscar
                            </button>
                        </div>

                        <div style="overflow-x:auto;">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Origen</th>
                                        <th>Tipo</th>
                                        <th>Criterio</th>
                                        <th>Asignado</th>
                                        <th>Estado</th>
                                        <th style="text-align:center;">No coinciden</th>
                                        <th style="text-align:center;">Exactitud</th>
                                    </tr>
                                </thead>
                                <tbody id="rc-tabla-body"></tbody>
                            </table>
                        </div>
                    </div>

                    <!-- DERECHA: Acción rápida -->
                    <div class="card" style="width:340px; flex-shrink:0;">
                        <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                            <h2 class="card-title">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                                </svg>
                                Acción rápida
                            </h2>
                        </div>
                        <div id="rc-accion-body">
                            <div style="text-align:center; color:var(--text-secondary); padding:3rem 1rem; font-size:0.88rem;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="40" height="40" style="display:block; margin:0 auto 1rem; opacity:0.35;">
                                    <polyline points="17 1 21 5 17 9"/>
                                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                    <polyline points="7 23 3 19 7 15"/>
                                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                                </svg>
                                Selecciona un reconteo de la tabla para ver las opciones.
                            </div>
                        </div>
                    </div>

                </div>

            </div>
        `;
        filtrarReconteos();
        return;
    }

    if (subId === 'informe') {
        const tareas = state.invTareas || [];
        const conteos = state.invConteos || [];
        const reconteos = state.invReconteos || [];

        const totalTareas = tareas.length;
        const conciliadas = conteos.filter(c => c.estado === 'completado' && (c.cantidadContada ?? 0) === (c.cantidadSistema ?? 0)).length;
        const totalReconteos = reconteos.length;
        const abiertas = tareas.filter(t => t.estado === 'activa' || t.estado === 'pendiente').length;

        const tareasRows = tareas.length === 0
            ? '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:2rem;">Sin tareas registradas</td></tr>'
            : [...tareas].reverse().map(t => {
                const its = conteos.filter(c => c.tareaId === t.codigo);
                const cnt = its.filter(c => c.cantidadContada !== null && c.cantidadContada !== undefined);
                const coi = cnt.filter(c => parseFloat(c.cantidadContada) === parseFloat(c.cantidadSistema)).length;
                const ex = cnt.length > 0 ? Math.round((coi / cnt.length) * 100) : null;
                const exHtml = ex === null
                    ? '<span style="color:var(--text-secondary);">—</span>'
                    : ex >= 95
                        ? '<span style="color:var(--accent-emerald);font-weight:600;">' + ex + '%</span>'
                        : ex >= 80
                            ? '<span style="color:#d97706;font-weight:600;">' + ex + '%</span>'
                            : '<span style="color:var(--accent-rose);font-weight:600;">' + ex + '%</span>';
                const eb = t.estado === 'completado' ? 'badge-success' : t.estado === 'activa' ? 'badge-info' : 'badge-warning';
                const rc = t.reconteo ? '<code style="font-size:0.79rem;">' + t.reconteo + '</code>' : '<span style="color:var(--text-secondary);">—</span>';
                return '<tr>'
                    + '<td><code style="font-size:0.8rem;">' + (t.codigo || '—') + '</code></td>'
                    + '<td>' + (t.tipo || '—') + '</td>'
                    + '<td>' + (t.criterio || '—') + '</td>'
                    + '<td><span class="badge ' + eb + '">' + (t.estado || '—') + '</span></td>'
                    + '<td style="text-align:center;">' + exHtml + '</td>'
                    + '<td style="text-align:center;">' + rc + '</td>'
                    + '</tr>';
            }).join('');

        content.innerHTML = `
            <div style="margin-top:1.5rem;">

                <div class="stats-grid" style="margin-bottom:1.5rem;">

                    <div class="card stat-card stat-cyan">
                        <div class="stat-header">
                            <span class="stat-title">Total tareas</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${totalTareas}</div>
                        <div class="stat-meta">
                            <span class="stat-trend neutral">Registradas</span>
                            <span class="stat-period">en sistema</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-emerald">
                        <div class="stat-header">
                            <span class="stat-title">Conciliadas</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${conciliadas}</div>
                        <div class="stat-meta">
                            <span class="stat-trend up">Sin diferencias</span>
                            <span class="stat-period">exactas</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-amber">
                        <div class="stat-header">
                            <span class="stat-title">Reconteos</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="17 1 21 5 17 9"/>
                                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                    <polyline points="7 23 3 19 7 15"/>
                                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${totalReconteos}</div>
                        <div class="stat-meta">
                            <span class="stat-trend ${totalReconteos > 0 ? 'down' : 'neutral'}">Generados</span>
                            <span class="stat-period">por diferencias</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-rose">
                        <div class="stat-header">
                            <span class="stat-title">Abiertas</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polyline points="12 6 12 12 16 14"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${abiertas}</div>
                        <div class="stat-meta">
                            <span class="stat-trend ${abiertas > 0 ? 'down' : 'up'}">${abiertas > 0 ? 'Pendientes' : 'Al día'}</span>
                            <span class="stat-period">en proceso</span>
                        </div>
                    </div>

                </div>

                <div style="display:flex; gap:1.25rem; align-items:flex-start;">

                    <!-- IZQUIERDA: Listado de tareas -->
                    <div class="card" style="flex:1; min-width:0;">
                        <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                            <h2 class="card-title">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="8" y1="6" x2="21" y2="6"/>
                                    <line x1="8" y1="12" x2="21" y2="12"/>
                                    <line x1="8" y1="18" x2="21" y2="18"/>
                                    <line x1="3" y1="6" x2="3.01" y2="6"/>
                                    <line x1="3" y1="12" x2="3.01" y2="12"/>
                                    <line x1="3" y1="18" x2="3.01" y2="18"/>
                                </svg>
                                Listado de tareas
                            </h2>
                        </div>
                        <div style="overflow-x:auto;">
                            <table class="data-table" style="width:100%; border-collapse:collapse;">
                                <colgroup>
                                    <col style="width:110px;">
                                    <col style="width:90px;">
                                    <col>
                                    <col style="width:100px;">
                                    <col style="width:80px;">
                                    <col style="width:100px;">
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Tipo</th>
                                        <th>Criterio</th>
                                        <th style="text-align:center;">Estado</th>
                                        <th style="text-align:center;">Exactitud</th>
                                        <th style="text-align:center;">Reconteo</th>
                                    </tr>
                                </thead>
                                <tbody>${tareasRows}</tbody>
                            </table>
                        </div>
                    </div>

                    <!-- DERECHA: Consulta por ID -->
                    <div class="card" style="width:320px; flex-shrink:0;">
                        <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                            <h2 class="card-title">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                Consulta por ID
                            </h2>
                        </div>
                        <div style="display:flex; gap:0.5rem; margin-bottom:0.75rem; flex-wrap:wrap;">
                            <div class="input-wrapper" style="flex:1; min-width:120px;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M4 6h16M4 12h16M4 18h7"/>
                                </svg>
                                <input type="text" class="form-input" id="inf-buscar-id" placeholder="INV-0001..." onkeydown="if(event.key==='Enter')buscarTareaInforme()">
                            </div>
                            <button class="btn btn-primary" onclick="buscarTareaInforme()" title="Consultar" style="padding:0 0.65rem;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                            </button>
                            <button class="btn btn-secondary" onclick="document.getElementById('inf-buscar-id').value='';buscarTareaInforme();" title="Recargar" style="padding:0 0.65rem;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
                                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
                                </svg>
                            </button>
                            <button class="btn btn-secondary" onclick="imprimirTareaInforme()" title="Imprimir tarea" style="padding:0 0.65rem;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
                                    <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                                </svg>
                            </button>
                        </div>
                        <div id="inf-detalle-tarea">
                            <div style="text-align:center; color:var(--text-secondary); padding:2.5rem 1rem; font-size:0.88rem;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="38" height="38" style="display:block; margin:0 auto 0.75rem; opacity:0.3;">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                Ingresa un ID de tarea para ver el detalle.
                            </div>
                        </div>
                    </div>

                </div>

                <div id="inf-reporte-tarea" style="margin-top:1.5rem;"></div>

            </div>
        `;
        return;
    }

    content.innerHTML = `
        <div class="card" style="margin-top: 1.5rem;">
            <div class="card-header">
                <h2 class="card-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round">
                        ${sub.icon}
                    </svg>
                    ${sub.label}
                </h2>
            </div>
            <div style="padding: 2rem; text-align: center; color: var(--text-secondary); font-size: 0.9rem;">
                Módulo <strong>${sub.label}</strong> en construcción.
            </div>
        </div>
    `;
}

function renderInformeCompletoTarea(tarea, items) {
    const empresa = state.settings?.companyName || 'Áureo S.A.';
    const slogan = state.settings?.companySlogan || 'Control logístico';
    const initials = empresa.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const BRAND = '#2E4A6E';
    const BRAND_LT = '#EBF0F7';
    const GRAY = '#6E6354';
    const BORDER = '#D8D0C0';

    const contados = items.filter(c => c.cantidadContada !== null && c.cantidadContada !== undefined);
    const coinciden = contados.filter(c => parseFloat(c.cantidadContada) === parseFloat(c.cantidadSistema)).length;
    const noCoinciden = contados.length - coinciden;
    const exactitud = contados.length > 0 ? Math.round((coinciden / contados.length) * 100) : 0;
    const totalSistema = items.reduce((s, c) => s + (parseFloat(c.cantidadSistema) || 0), 0);
    const totalContado = contados.reduce((s, c) => s + (parseFloat(c.cantidadContada) || 0), 0);
    const desviacion = contados.length > 0 ? totalContado - totalSistema : null;

    const v = x => x || '—';

    const metaCell = (label, value) =>
        '<td style="border:1px solid ' + BORDER + '; padding:0.6rem 0.8rem; vertical-align:top; width:25%;">'
        + '<div style="font-size:0.68rem; color:' + BRAND + '; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:0.25rem;">' + label + '</div>'
        + '<div style="font-size:0.9rem; font-weight:700; color:#1a1a1a;">' + value + '</div>'
        + '</td>';

    const statCell = (label, value, color) =>
        '<td style="border:1px solid ' + BORDER + '; padding:0.6rem 0.8rem; vertical-align:top; width:25%;">'
        + '<div style="font-size:0.68rem; color:' + (color || BRAND) + '; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:0.25rem;">' + label + '</div>'
        + '<div style="font-size:1rem; font-weight:700; color:' + (color || '#1a1a1a') + ';">' + value + '</div>'
        + '</td>';

    const hojaTh = col => '<th style="background:#f1ede3; border:1px solid ' + BORDER + '; padding:0.35rem 0.45rem; font-size:0.68rem; font-weight:700; color:' + BRAND + '; white-space:nowrap;">' + col + '</th>';
    const hojaTd = val => '<td style="border:1px solid ' + BORDER + '; padding:0.32rem 0.45rem; font-size:0.72rem; color:#1a1a1a; white-space:nowrap;">' + v(val) + '</td>';

    const difTh = col => '<th style="background:#f1ede3; border:1px solid ' + BORDER + '; padding:0.35rem 0.6rem; font-size:0.7rem; font-weight:700; color:' + BRAND + ';">' + col + '</th>';
    const difTd = (val, extra) => '<td style="border:1px solid ' + BORDER + '; padding:0.32rem 0.6rem; font-size:0.73rem;' + (extra || '') + '">' + v(val) + '</td>';

    const hojaRows = items.length === 0
        ? '<tr><td colspan="14" style="text-align:center; padding:1rem; color:' + GRAY + '; font-size:0.8rem;">Sin líneas registradas</td></tr>'
        : items.map((c, i) => '<tr>'
            + hojaTd(c.detalle || (300 + i + 1))
            + hojaTd(c.ubicacion)
            + hojaTd(c.base)
            + hojaTd(c.posicion)
            + hojaTd(c.zona)
            + hojaTd(c.codigoMaterial)
            + hojaTd(c.descripcion)
            + hojaTd(c.familia)
            + hojaTd(c.um)
            + hojaTd(c.loteAlmacen)
            + hojaTd(c.loteProveedor)
            + hojaTd(c.fechaVencimiento)
            + hojaTd(c.cantidadSistema)
            + hojaTd(c.obs)
            + '</tr>').join('');

    const difRows = items.length === 0
        ? '<tr><td colspan="9" style="text-align:center; padding:1rem; color:' + GRAY + '; font-size:0.8rem;">Sin líneas</td></tr>'
        : items.map((c, i) => {
            const diff = (c.cantidadContada !== null && c.cantidadContada !== undefined)
                ? parseFloat(c.cantidadContada) - parseFloat(c.cantidadSistema) : null;
            const coinc = diff === null ? 'Pendiente' : diff === 0 ? 'Sí' : 'No';
            const diffColor = diff === null ? GRAY : diff === 0 ? '#3a6e3a' : '#a8442c';
            return '<tr>'
                + difTd(c.detalle || (300 + i + 1))
                + difTd(c.ubicacion)
                + difTd(c.codigoMaterial)
                + difTd(c.descripcion)
                + difTd(c.cantidadSistema)
                + difTd(c.cantidadContada)
                + '<td style="border:1px solid ' + BORDER + '; padding:0.32rem 0.6rem; font-size:0.73rem; color:' + diffColor + '; font-weight:600;">' + (diff !== null ? (diff > 0 ? '+' : '') + diff : '—') + '</td>'
                + '<td style="border:1px solid ' + BORDER + '; padding:0.32rem 0.6rem; font-size:0.73rem; color:' + diffColor + ';">' + coinc + '</td>'
                + difTd(c.obs)
                + '</tr>';
        }).join('');

    const hayDiferencias = noCoinciden > 0;
    const resumenColor = hayDiferencias ? '#fff3cd' : '#d4edda';
    const resumenBorder = hayDiferencias ? '#f0c65e' : '#92c49a';
    const resumenText = hayDiferencias ? '#7a5c00' : '#1f5c2e';
    const resumenMsg = hayDiferencias
        ? 'Se detectaron <strong>' + noCoinciden + '</strong> diferencia(s) en la tarea. Se requiere revisión o reconteo.'
        : 'No se detectaron diferencias en la tarea. El conteo coincide con el stock del sistema.';

    const secTitle = (icon, label) =>
        '<div style="display:flex; align-items:center; gap:0.5rem; font-size:0.95rem; font-weight:700; color:#1a1a1a; margin:1.5rem 0 0.75rem;">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="' + BRAND + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="17" height="17">' + icon + '</svg>'
        + label + '</div>';

    const sigLine = label =>
        '<div style="flex:1; text-align:center;">'
        + '<div style="border-top:1px solid #999; margin-bottom:0.4rem;"></div>'
        + '<div style="font-size:0.75rem; color:' + GRAY + ';">' + label + '</div>'
        + '</div>';

    return '<div style="background:#ffffff; border:1px solid ' + BORDER + '; border-radius:8px; padding:2rem; font-family:Arial,sans-serif; font-size:13px; color:#1a1a1a;">'

        // ── HEADER ──
        + '<div style="display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:1rem; margin-bottom:1.25rem; border-bottom:2.5px solid ' + BRAND + ';">'
        + '<div style="display:flex; align-items:center; gap:0.9rem;">'
        + '<div style="width:48px; height:48px; border-radius:50%; background:' + BRAND + '; display:flex; align-items:center; justify-content:center; flex-shrink:0;">'
        + '<span style="color:#fff; font-size:1.2rem; font-weight:800; letter-spacing:-1px;">' + initials + '</span>'
        + '</div>'
        + '<div>'
        + '<div style="font-size:1rem; font-weight:800; color:' + BRAND + '; line-height:1.1;">' + empresa + '</div>'
        + '<div style="font-size:0.72rem; color:' + GRAY + '; margin-bottom:0.35rem;">' + slogan + '</div>'
        + '<div style="font-size:1.15rem; font-weight:800; color:#1a1a1a; line-height:1.1;">INFORME DE INVENTARIO</div>'
        + '<div style="font-size:0.7rem; color:' + GRAY + ';">Documento operativo de tarea de inventario</div>'
        + '</div>'
        + '</div>'
        + '<div style="font-size:0.88rem; font-weight:800; color:' + BRAND + '; border:1.5px solid ' + BRAND + '; border-radius:5px; padding:0.3rem 0.75rem; white-space:nowrap;">TAREA ' + tarea.codigo + '</div>'
        + '</div>'

        // ── METADATA GRID ──
        + '<table style="width:100%; border-collapse:collapse; margin-bottom:0;">'
        + '<tr>' + metaCell('Estado', v(tarea.estado).toUpperCase()) + metaCell('Tipo de conteo', v(tarea.tipo)) + metaCell('Criterio', v(tarea.criterio)) + metaCell('Asignado a', v(tarea.asignado)) + '</tr>'
        + '<tr>' + metaCell('Creado por', v(tarea.creadopor)) + metaCell('Reconteo', tarea.reconteo ? 'Sí' : 'No') + metaCell('Fecha creación', v(tarea.fecha)) + metaCell('Fecha inicio', v(tarea.fechaInicio)) + '</tr>'
        + '<tr>' + metaCell('Fecha finalización', v(tarea.fechaFinalizacion)) + metaCell('Fecha conciliación', v(tarea.fechaConciliacion)) + metaCell('Fecha cierre', v(tarea.fechaCierre)) + metaCell('Tarea origen', v(tarea.tareaOrigen)) + '</tr>'
        + '</table>'

        // ── OBSERVACIÓN GENERAL ──
        + (tarea.obs ? '<div style="margin-top:1rem; padding:0.75rem 1rem; background:' + BRAND_LT + '; border-radius:5px; border-left:3px solid ' + BRAND + ';">'
            + '<div style="font-size:0.75rem; font-weight:700; color:' + BRAND + '; margin-bottom:0.25rem;">Observación general</div>'
            + '<div style="font-size:0.82rem; color:#1a1a1a;">' + tarea.obs + '</div>'
            + '</div>' : '')

        // ── STATS GRID ──
        + '<table style="width:100%; border-collapse:collapse; margin-top:1rem;">'
        + '<tr>' + statCell('Total líneas', items.length) + statCell('Líneas contadas', contados.length) + statCell('Coinciden', coinciden, '#3a6e3a') + statCell('No coinciden', noCoinciden, noCoinciden > 0 ? '#a8442c' : GRAY) + '</tr>'
        + '<tr>' + statCell('Exactitud', exactitud + '%', exactitud >= 95 ? '#3a6e3a' : exactitud >= 80 ? '#a87000' : '#a8442c') + statCell('Total sistema', totalSistema) + statCell('Total contado', contados.length > 0 ? totalContado : '—') + statCell('Desviación total', desviacion !== null ? (desviacion > 0 ? '+' : '') + desviacion : '—', desviacion !== null && desviacion !== 0 ? '#a8442c' : '#3a6e3a') + '</tr>'
        + '</table>'

        // ── HOJA DE CONTEO ──
        + secTitle('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>', 'Hoja de conteo')
        + '<div style="overflow-x:auto;">'
        + '<table style="width:100%; border-collapse:collapse; font-size:0.72rem;">'
        + '<thead><tr>' + ['Det.', 'Ubic.', 'Base', 'Pos.', 'Zona', 'Cod.', 'Desc.', 'Fam.', 'UM', 'Lote alm.', 'Lote prov.', 'FV', 'Cant.', 'Obs.'].map(hojaTh).join('') + '</tr></thead>'
        + '<tbody>' + hojaRows + '</tbody>'
        + '</table></div>'

        // ── ANÁLISIS DE DIFERENCIAS ──
        + secTitle('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 'Análisis de diferencias')
        + '<div style="overflow-x:auto;">'
        + '<table style="width:100%; border-collapse:collapse;">'
        + '<thead><tr>' + ['Detalle', 'Ubicación', 'Código material', 'Descripción', 'Sistema', 'Contado', 'Diferencia', 'Coincide', 'Observación'].map(difTh).join('') + '</tr></thead>'
        + '<tbody>' + difRows + '</tbody>'
        + '</table></div>'
        + '<div style="font-size:0.8rem; font-weight:700; color:#1a1a1a; margin:0.75rem 0 0.35rem;">Resumen de diferencias</div>'
        + '<div style="background:' + resumenColor + '; border:1px solid ' + resumenBorder + '; border-radius:5px; padding:0.6rem 0.9rem; font-size:0.8rem; color:' + resumenText + ';">' + resumenMsg + '</div>'

        // ── CIERRE DEL INFORME ──
        + secTitle('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 'Cierre del informe')
        + '<table style="width:100%; border-collapse:collapse;">'
        + '<tr>' + statCell('Estado final', v(tarea.estado).toUpperCase()) + statCell('Total líneas', items.length) + statCell('Coinciden', coinciden, '#3a6e3a') + statCell('No coinciden', noCoinciden, noCoinciden > 0 ? '#a8442c' : GRAY) + '</tr>'
        + '<tr>' + statCell('Exactitud', exactitud + '%') + statCell('Generó reconteo', tarea.reconteo ? 'Sí' : 'No') + statCell('ID reconteo generado', v(tarea.reconteo)) + '<td style="border:1px solid ' + BORDER + ';"></td>' + '</tr>'
        + '</table>'

        // ── FOOTER FIRMAS ──
        + '<div style="display:flex; gap:3rem; margin-top:2.5rem;">'
        + sigLine('Responsable conteo')
        + sigLine('Supervisor / validación')
        + sigLine('Aprobación final')
        + '</div>'

        + '</div>';
}

function buscarTareaInforme() {
    const q = (document.getElementById('inf-buscar-id')?.value || '').trim().toUpperCase();
    const panel = document.getElementById('inf-detalle-tarea');
    if (!panel) return;

    const clearRep = () => { const r = document.getElementById('inf-reporte-tarea'); if (r) r.innerHTML = ''; };

    if (!q) {
        panel.innerHTML = `
            <div style="text-align:center; color:var(--text-secondary); padding:2.5rem 1rem; font-size:0.88rem;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="38" height="38" style="display:block; margin:0 auto 0.75rem; opacity:0.3;">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Ingresa un ID de tarea para ver el detalle.
            </div>`;
        clearRep(); return;
    }

    const tarea = (state.invTareas || []).find(t => (t.codigo || '').toUpperCase().includes(q));
    if (!tarea) {
        panel.innerHTML = '<div style="text-align:center; color:var(--accent-rose); padding:2rem 1rem; font-size:0.88rem;">No se encontró ninguna tarea con ID <strong>' + q + '</strong>.</div>';
        clearRep(); return;
    }

    const conteos = state.invConteos || [];
    const items = conteos.filter(c => c.tareaId === tarea.codigo);
    const contados = items.filter(c => c.cantidadContada !== null && c.cantidadContada !== undefined);
    const coinciden = contados.filter(c => parseFloat(c.cantidadContada) === parseFloat(c.cantidadSistema)).length;
    const exactitud = contados.length > 0 ? Math.round((coinciden / contados.length) * 100) : null;
    const exactColor = exactitud === null ? 'var(--text-secondary)' : exactitud >= 95 ? 'var(--accent-emerald)' : exactitud >= 80 ? '#d97706' : 'var(--accent-rose)';
    const estadoBadge = tarea.estado === 'completado' ? 'badge-success' : tarea.estado === 'activa' ? 'badge-info' : 'badge-warning';

    const noCoinciden = contados.length - coinciden;
    const tieneReconteo = !!tarea.reconteo;

    const kpi = (label, value, sub = '', color = 'var(--text-primary)') => `
        <div class="card" style="padding:0.75rem 0.9rem; flex:1; min-width:120px;">
            <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:0.3rem;">${label}</div>
            <div style="font-size:1.15rem; font-weight:700; color:${color}; line-height:1.2;">${value}</div>
            ${sub ? `<div style="font-size:0.7rem; color:var(--text-secondary); margin-top:0.2rem;">${sub}</div>` : ''}
        </div>`;

    panel.innerHTML = `
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.5rem;">
            ${kpi('Tarea', '<code style="font-size:0.9rem;">' + tarea.codigo + '</code>')}
            ${kpi('Estado', '<span class="badge ' + estadoBadge + '" style="font-size:0.75rem;">' + (tarea.estado || '—') + '</span>')}
            ${kpi('Total líneas', items.length, 'ítems registrados')}
            ${kpi('Coinciden', coinciden, 'sin diferencia', 'var(--accent-emerald)')}
        </div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            ${kpi('No coinciden', noCoinciden, 'con diferencia', noCoinciden > 0 ? 'var(--accent-rose)' : 'var(--text-secondary)')}
            ${kpi('Exactitud', exactitud !== null ? exactitud + '%' : '—', 'precisión conteo', exactColor)}
            ${kpi('Genera reconteo', tieneReconteo ? 'Sí' : 'No', '', tieneReconteo ? '#d97706' : 'var(--text-secondary)')}
            ${kpi('ID reconteo', tarea.reconteo ? '<code style="font-size:0.8rem;">' + tarea.reconteo + '</code>' : '—')}
        </div>`;

    const rep = document.getElementById('inf-reporte-tarea');
    if (rep) rep.innerHTML = renderInformeCompletoTarea(tarea, items);
}

function imprimirTareaInforme() {
    const q = (document.getElementById('inf-buscar-id')?.value || '').trim().toUpperCase();
    const tarea = q ? (state.invTareas || []).find(t => (t.codigo || '').toUpperCase().includes(q)) : null;
    if (!tarea) { triggerToast('warning', 'Consulta una tarea antes de imprimir.'); return; }
    const items = (state.invConteos || []).filter(c => c.tareaId === tarea.codigo);
    const body = renderInformeCompletoTarea(tarea, items);
    const win = window.open('', '_blank', 'width=1100,height=900');
    win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tarea ' + tarea.codigo + '</title>'
        + '<style>body{margin:2rem;background:#fff;}@media print{body{margin:1rem;}}</style>'
        + '</head><body>' + body + '<script>window.onload=function(){window.print();}<\/script></body></html>');
    win.document.close();
}

function verInformeTarea(codigo) {
    switchInventarioSub('informe');
    setTimeout(() => {
        const input = document.getElementById('inf-buscar-id');
        if (input) { input.value = codigo; buscarTareaInforme(); }
    }, 80);
}

function filtrarConteosF() {
    const idTarea = (document.getElementById('cf-buscar-id')?.value || '').toLowerCase().trim();
    const usuario = (document.getElementById('cf-buscar-usuario')?.value || '').toLowerCase().trim();
    const tbody = document.getElementById('cf-tabla-body');
    if (!tbody) return;

    const conteos = (state.invConteos || []).filter(c => {
        if (idTarea && !(c.tareaId || '').toLowerCase().includes(idTarea)) return false;
        if (usuario && !(c.usuario || '').toLowerCase().includes(usuario)) return false;
        return true;
    });

    if (conteos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:2rem;">No se encontraron conteos.</td></tr>`;
        return;
    }

    tbody.innerHTML = [...conteos].reverse().map((c, idx) => `
        <tr>
            <td style="text-align:center;">
                <button class="btn btn-secondary" style="padding:0.2rem 0.5rem; font-size:0.75rem;"
                    onclick="verDetalleConteoF(${idx})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                </button>
            </td>
            <td>${escapeHtml(c.ubicacion) || '—'}</td>
            <td>${escapeHtml(c.zona) || '—'}</td>
            <td><span class="badge badge-info">${escapeHtml(c.codigoMaterial) || '—'}</span></td>
            <td>${escapeHtml(c.descripcion) || '—'}</td>
            <td>${escapeHtml(c.loteAlmacen) || '—'}</td>
            <td>${escapeHtml(c.loteProveedor) || '—'}</td>
            <td>${escapeHtml(c.fv) || '—'}</td>
            <td>
                <input type="number" min="0"
                    style="width:80px; padding:0.25rem 0.4rem; border:1px solid var(--border-subtle); border-radius:4px; font-size:0.82rem; background:var(--bg-primary); color:var(--text-primary);"
                    value="${c.cantidadContada ?? ''}"
                    onchange="actualizarCantidadConteoF(${idx}, this.value)"
                    placeholder="0">
            </td>
            <td>
                <input type="text"
                    style="width:120px; padding:0.25rem 0.4rem; border:1px solid var(--border-subtle); border-radius:4px; font-size:0.82rem; background:var(--bg-primary); color:var(--text-primary);"
                    value="${c.obs || ''}"
                    onchange="actualizarObsConteoF(${idx}, this.value)"
                    placeholder="Observación...">
            </td>
        </tr>
    `).join('');
}

let _cf_filtrados = [];

function actualizarCantidadConteoF(idx, valor) {
    const conteos = (state.invConteos || []).filter((c, i, arr) => {
        const idTarea = (document.getElementById('cf-buscar-id')?.value || '').toLowerCase().trim();
        const usuario = (document.getElementById('cf-buscar-usuario')?.value || '').toLowerCase().trim();
        if (idTarea && !(c.tareaId || '').toLowerCase().includes(idTarea)) return false;
        if (usuario && !(c.usuario || '').toLowerCase().includes(usuario)) return false;
        return true;
    });
    const real = [...conteos].reverse();
    if (real[idx]) real[idx].cantidadContada = parseFloat(valor) || 0;
    saveState();
}

function actualizarObsConteoF(idx, valor) {
    const conteos = (state.invConteos || []).filter(c => {
        const idTarea = (document.getElementById('cf-buscar-id')?.value || '').toLowerCase().trim();
        const usuario = (document.getElementById('cf-buscar-usuario')?.value || '').toLowerCase().trim();
        if (idTarea && !(c.tareaId || '').toLowerCase().includes(idTarea)) return false;
        if (usuario && !(c.usuario || '').toLowerCase().includes(usuario)) return false;
        return true;
    });
    const real = [...conteos].reverse();
    if (real[idx]) real[idx].obs = valor;
    saveState();
}

function guardarConteoF() {
    saveState();
    mostrarToast('Conteo guardado correctamente', 'emerald');
}

function verDetalleConteoF(idx) {
    // Placeholder hasta desarrollar vista de detalle de conteo
    triggerToast('notif', 'La vista de detalle de conteo estará disponible próximamente.');
}

function recargarConteosF() {
    const inputId = document.getElementById('cf-buscar-id');
    const inputUsuario = document.getElementById('cf-buscar-usuario');
    if (inputId) inputId.value = '';
    if (inputUsuario) inputUsuario.value = '';
    filtrarConteosF();
}

// ==========================================================================
//   CONCILIACIÓN
// ==========================================================================

function filtrarConciliacion() {
    const idTarea = (document.getElementById('conc-buscar-tarea')?.value || '').toLowerCase().trim();
    const usuario = (document.getElementById('conc-buscar-usuario')?.value || '').toLowerCase().trim();
    const reconteo = (document.getElementById('conc-buscar-reconteo')?.value || '').toLowerCase().trim();
    const tbody = document.getElementById('conc-tabla-body');
    if (!tbody) return;

    const items = (state.invConteos || []).filter(c => {
        if (idTarea && !(c.tareaId || '').toLowerCase().includes(idTarea)) return false;
        if (usuario && !(c.usuarioFinaliza || '').toLowerCase().includes(usuario)) return false;
        if (reconteo && !(c.asignadoReconteo || '').toLowerCase().includes(reconteo)) return false;
        return true;
    });

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:var(--text-muted); padding:2rem;">No se encontraron ítems para conciliar.</td></tr>`;
        return;
    }

    tbody.innerHTML = [...items].reverse().map(c => {
        const sis = parseFloat(c.cantidadSistema ?? 0);
        const fis = parseFloat(c.cantidadContada ?? 0);
        const diff = fis - sis;
        const ok = diff === 0;

        const diffColor = ok ? 'color:var(--accent-emerald,#10b981);' : 'color:var(--accent-rose,#f43f5e);';
        const rowStyle = ok ? '' : 'background:rgba(244,63,94,0.04);';
        const coincide = ok
            ? '<span style="color:var(--accent-emerald,#10b981); font-size:1.15rem; font-weight:700;">&#10003;</span>'
            : '<span style="color:var(--accent-rose,#f43f5e);   font-size:1.15rem; font-weight:700;">&#10007;</span>';

        return `
            <tr style="${rowStyle}">
                <td style="text-align:center;">
                    <button class="btn btn-secondary" style="padding:0.2rem 0.5rem; font-size:0.75rem;"
                        onclick="triggerToast('notif', 'El detalle de conciliación estará disponible próximamente.')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                    </button>
                </td>
                <td>${escapeHtml(c.ubicacion) || '—'}</td>
                <td><span class="badge badge-info">${escapeHtml(c.codigoMaterial) || '—'}</span></td>
                <td>${escapeHtml(c.descripcion) || '—'}</td>
                <td>${escapeHtml(c.loteAlmacen) || '—'}</td>
                <td>${escapeHtml(c.loteProveedor) || '—'}</td>
                <td style="text-align:right; font-weight:500;">${sis}</td>
                <td style="text-align:right; font-weight:500;">${fis}</td>
                <td style="text-align:right; font-weight:700; ${diffColor}">${diff > 0 ? '+' : ''}${diff}</td>
                <td style="text-align:center;">${coincide}</td>
                <td style="font-size:0.8rem; color:var(--text-secondary);">${escapeHtml(c.obs) || '—'}</td>
            </tr>
        `;
    }).join('');
}

function recargarConciliacion() {
    const inputTarea = document.getElementById('conc-buscar-tarea');
    const inputUsuario = document.getElementById('conc-buscar-usuario');
    const inputReconteo = document.getElementById('conc-buscar-reconteo');
    if (inputTarea) inputTarea.value = '';
    if (inputUsuario) inputUsuario.value = '';
    if (inputReconteo) inputReconteo.value = '';
    filtrarConciliacion();
}

function cerrarTareaConciliacion() {
    const idTarea = (document.getElementById('conc-buscar-tarea')?.value || '').trim();

    if (!idTarea) {
        mostrarToast('Ingresa el ID de tarea antes de cerrar', 'amber');
        return;
    }

    const items = (state.invConteos || []).filter(c => (c.tareaId || '') === idTarea);
    const conDiff = items.some(c => (c.cantidadContada ?? 0) !== (c.cantidadSistema ?? 0));

    if (conDiff) {
        mostrarToast('Existen diferencias. Genera el reconteo antes de cerrar la tarea.', 'rose');
        return;
    }

    if (!confirm(`¿Confirmas cerrar la tarea ${idTarea}? Esta acción es definitiva.`)) return;

    items.forEach(c => { c.estado = 'completado'; });

    const tarea = (state.invTareas || []).find(t => t.codigo === idTarea);
    if (tarea) tarea.estado = 'cerrada';

    saveState();
    mostrarToast(`Tarea ${idTarea} cerrada correctamente`, 'emerald');
    filtrarConciliacion();
}

function generarReconteoAuto() {
    const idTarea = (document.getElementById('conc-buscar-tarea')?.value || '').trim();

    if (!idTarea) {
        mostrarToast('Ingresa el ID de tarea para generar el reconteo', 'amber');
        return;
    }

    const tareaOrigen = (state.invTareas || []).find(t => t.codigo === idTarea);
    const itemsConDiff = (state.invConteos || []).filter(c =>
        (c.tareaId || '') === idTarea &&
        (c.cantidadContada ?? 0) !== (c.cantidadSistema ?? 0)
    );

    if (itemsConDiff.length === 0) {
        mostrarToast('No hay diferencias. La tarea puede cerrarse directamente.', 'cyan');
        return;
    }

    // Generar código único para la nueva tarea de reconteo
    const fecha = new Date();
    const sufijo = Math.random().toString(36).slice(2, 6).toUpperCase();
    const codigoRC = `RC-${idTarea}-${sufijo}`;

    // 1. Crear nueva tarea de reconteo en invTareas
    if (!state.invTareas) state.invTareas = [];
    state.invTareas.push({
        codigo: codigoRC,
        tipo: 'Reconteo',
        zona: tareaOrigen?.zona || '',
        criterio: tareaOrigen?.criterio || '',
        asignado: tareaOrigen?.asignado || '',
        creadopor: 'Sistema',
        estado: 'pendiente',
        reconteo: idTarea,
        fecha: fecha.toLocaleDateString('es-CO'),
        obs: `Reconteo automático generado desde tarea ${idTarea}`
    });

    // 2. Crear ítems de conteo para la nueva tarea (resetear cantidad contada)
    if (!state.invConteos) state.invConteos = [];
    itemsConDiff.forEach(c => {
        state.invConteos.push({
            tareaId: codigoRC,
            ubicacion: c.ubicacion || '',
            zona: c.zona || '',
            codigoMaterial: c.codigoMaterial || '',
            descripcion: c.descripcion || '',
            loteAlmacen: c.loteAlmacen || '',
            loteProveedor: c.loteProveedor || '',
            fv: c.fv || '',
            cantidadSistema: c.cantidadSistema ?? 0,
            cantidadContada: null,
            estado: 'pendiente',
            usuario: '',
            fecha: fecha.toLocaleDateString('es-CO'),
            obs: ''
        });
        // Marcar ítem original como reconteo pendiente
        c.estado = 'reconteo pendiente';
    });

    // 3. Cambiar estado de la tarea original
    if (tareaOrigen) tareaOrigen.estado = 'reconteo pendiente';

    // 4. Registrar en invReconteos para seguimiento
    if (!state.invReconteos) state.invReconteos = [];
    state.invReconteos.push({
        id: codigoRC,
        tareaOrigen: idTarea,
        items: itemsConDiff.length,
        estado: 'abierto',
        fecha: fecha.toLocaleDateString('es-CO')
    });

    saveState();
    mostrarToast(`Reconteo ${codigoRC} creado con ${itemsConDiff.length} ítem(s)`, 'amber');
    filtrarConciliacion();
}

// ==========================================================================
//   RECONTEOS
// ==========================================================================

function filtrarReconteos() {
    const asignado = (document.getElementById('rc-buscar-asignado')?.value || '').toLowerCase().trim();
    const estado = document.getElementById('rc-filtro-estado')?.value || 'todos';
    const tbody = document.getElementById('rc-tabla-body');
    if (!tbody) return;

    const tareas = state.invTareas || [];

    let lista = (state.invReconteos || []).filter(r => {
        const tarea = tareas.find(t => t.codigo === r.id) || {};
        const asig = (tarea.asignado || r.asignado || '').toLowerCase();
        if (asignado && !asig.includes(asignado)) return false;
        if (estado !== 'todos') {
            const est = (r.estado || '').toLowerCase();
            if (estado === 'pendiente' && est !== 'abierto' && est !== 'pendiente') return false;
            if (estado !== 'pendiente' && est !== estado) return false;
        }
        return true;
    });

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:2rem;">No se encontraron reconteos.</td></tr>`;
        return;
    }

    const estadoBadge = est => {
        const map = {
            'abierto': ['badge-warning', 'Pendiente'],
            'pendiente': ['badge-warning', 'Pendiente'],
            'en proceso': ['badge-info', 'En proceso'],
            'conciliada': ['badge-info', 'Conciliada'],
            'cerrada': ['badge-success', 'Cerrada'],
            'cerrado': ['badge-success', 'Cerrado'],
        };
        const [cls, label] = map[(est || '').toLowerCase()] || ['badge-secondary', est || '—'];
        return `<span class="badge ${cls}">${label}</span>`;
    };

    tbody.innerHTML = [...lista].reverse().map(r => {
        const tarea = tareas.find(t => t.codigo === r.id) || {};
        const itemsRC = (state.invConteos || []).filter(c => c.tareaId === r.id);
        const contados = itemsRC.filter(c => c.cantidadContada !== null && c.cantidadContada !== undefined);
        const coinciden = contados.filter(c => parseFloat(c.cantidadContada) === parseFloat(c.cantidadSistema)).length;
        const exactitud = contados.length > 0 ? `${Math.round((coinciden / contados.length) * 100)}%` : '—';

        return `
            <tr style="cursor:pointer;" onclick="seleccionarReconteo('${r.id}')"
                onmouseover="this.style.background='var(--bg-hover,rgba(255,255,255,0.04))'"
                onmouseout="this.style.background=''">
                <td><span class="badge badge-info">${r.id}</span></td>
                <td style="font-size:0.82rem; color:var(--text-secondary);">${r.tareaOrigen || '—'}</td>
                <td>${tarea.tipo || '—'}</td>
                <td>${tarea.criterio || '—'}</td>
                <td>${tarea.asignado || r.asignado || '—'}</td>
                <td>${estadoBadge(r.estado)}</td>
                <td style="text-align:center; font-weight:600; color:var(--accent-rose,#f43f5e);">${r.items ?? '—'}</td>
                <td style="text-align:center; font-weight:600;">${exactitud}</td>
            </tr>
        `;
    }).join('');
}

function seleccionarReconteo(id) {
    const panel = document.getElementById('rc-accion-body');
    if (!panel) return;

    document.querySelectorAll('#rc-tabla-body tr').forEach(tr => tr.style.background = '');
    const rowEl = [...document.querySelectorAll('#rc-tabla-body tr')]
        .find(tr => tr.querySelector('.badge')?.textContent === id);
    if (rowEl) rowEl.style.background = 'var(--bg-hover,rgba(255,255,255,0.06))';

    const r = (state.invReconteos || []).find(r => r.id === id);
    const tarea = (state.invTareas || []).find(t => t.codigo === id) || {};

    if (!r) {
        panel.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:2rem;">Reconteo no encontrado.</p>`;
        return;
    }

    const estadoBadge = est => {
        const map = {
            'abierto': ['badge-warning', 'Pendiente'],
            'pendiente': ['badge-warning', 'Pendiente'],
            'en proceso': ['badge-info', 'En proceso'],
            'conciliada': ['badge-info', 'Conciliada'],
            'cerrada': ['badge-success', 'Cerrada'],
            'cerrado': ['badge-success', 'Cerrado'],
        };
        const [cls, label] = map[(est || '').toLowerCase()] || ['badge-secondary', est || '—'];
        return `<span class="badge ${cls}">${label}</span>`;
    };

    const fila = (label, valor) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.65rem 0; border-bottom:1px solid var(--border-subtle);">
            <span style="font-size:0.8rem; color:var(--text-secondary);">${label}</span>
            <span style="font-size:0.88rem; font-weight:500; color:var(--text-primary); text-align:right;">${valor}</span>
        </div>`;

    panel.innerHTML = `
        <div style="padding:0 0.25rem 1.25rem;">
            ${fila('ID Reconteo', `<span class="badge badge-info">${r.id}</span>`)}
            ${fila('Tarea origen', r.tareaOrigen || '—')}
            ${fila('Categoría', tarea.zona || '—')}
            ${fila('Asignado', tarea.asignado || r.asignado || '—')}
            ${fila('Estado', estadoBadge(r.estado))}
        </div>
        <div style="display:flex; flex-direction:column; gap:0.6rem; padding-top:0.25rem;">
            <button class="btn btn-primary" onclick="switchInventarioSub('conteos')" style="justify-content:center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                    <polyline points="17 1 21 5 17 9"/>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                    <polyline points="7 23 3 19 7 15"/>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
                Ir a reconteo
            </button>
            <button class="btn btn-secondary" onclick="switchInventarioSub('conciliacion')" style="justify-content:center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                    <line x1="18" y1="20" x2="18" y2="10"/>
                    <line x1="12" y1="20" x2="12" y2="4"/>
                    <line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
                Ver conciliación
            </button>
            <button class="btn btn-secondary" onclick="switchInventarioSub('informe')" style="justify-content:center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                    <path d="M14 3v4a1 1 0 0 0 1 1h4"/>
                    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                    <line x1="9" y1="11" x2="15" y2="11"/>
                </svg>
                Ver informe
            </button>
        </div>
    `;
}

function mostrarToast(msg, color) {
    const colores = {
        emerald: '#10b981',
        amber: '#f59e0b',
        rose: '#f43f5e',
        cyan: '#06b6d4'
    };
    const bg = colores[color] || colores.emerald;
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;background:${bg};color:#fff;padding:0.75rem 1.25rem;border-radius:8px;font-size:0.88rem;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.18);`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
}

function invActualizarResumen() {
    const codigo = document.getElementById('inv-tarea-codigo')?.value || '';
    const tipo = document.getElementById('inv-tarea-tipo')?.value || '';
    const zona = document.getElementById('inv-tarea-zona')?.value || '';
    const asignado = document.getElementById('inv-tarea-asignado')?.value || '';
    const creadopor = document.getElementById('inv-tarea-creadopor')?.value || '';
    const obs = document.getElementById('inv-tarea-obs')?.value || '';

    const body = document.getElementById('inv-resumen-body');
    const badge = document.getElementById('inv-resumen-badge');
    if (!body) return;

    const tieneData = tipo || zona || asignado || creadopor;

    if (badge) {
        badge.className = tieneData ? 'badge badge-success' : 'badge badge-info';
        badge.textContent = tieneData ? 'En progreso' : 'Borrador';
    }

    if (!tieneData) {
        body.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 3rem 1rem; font-size: 0.88rem;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                    stroke-linecap="round" stroke-linejoin="round" width="40" height="40"
                    style="display: block; margin: 0 auto 1rem; opacity: 0.35;">
                    <path d="M14 3v4a1 1 0 0 0 1 1h4"/>
                    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
                </svg>
                Completa el formulario para ver el resumen de la tarea.
            </div>`;
        return;
    }

    const fila = (label, valor) => valor
        ? `<div style="display:flex; justify-content:space-between; align-items:flex-start; padding: 0.75rem 0; border-bottom: 1px solid var(--border-subtle);">
               <span style="font-size:0.8rem; color:var(--text-secondary); min-width: 130px;">${label}</span>
               <span style="font-size:0.88rem; color:var(--text-primary); font-weight:500; text-align:right;">${valor}</span>
           </div>`
        : '';

    body.innerHTML = `
        <div style="padding: 0 0.25rem;">
            ${fila('Código', codigo)}
            ${fila('Tipo de conteo', tipo)}
            ${fila('Zona', zona)}
            ${fila('Asignado a', asignado)}
            ${fila('Creado por', creadopor)}
            ${obs ? `<div style="margin-top: 1rem;">
                <span style="font-size:0.8rem; color:var(--text-secondary);">Observación</span>
                <p style="font-size:0.88rem; color:var(--text-primary); margin-top:0.4rem; line-height:1.5;">${obs}</p>
            </div>` : ''}
        </div>
    `;
}

function invGuardarTarea() {
    const codigo = document.getElementById('inv-tarea-codigo')?.value;
    const tipo = document.getElementById('inv-tarea-tipo')?.value;
    const zona = document.getElementById('inv-tarea-zona')?.value;
    const asignado = document.getElementById('inv-tarea-asignado')?.value;
    const creadopor = document.getElementById('inv-tarea-creadopor')?.value;
    const obs = document.getElementById('inv-tarea-obs')?.value;
    const fecha = new Date().toLocaleDateString('es-CO');

    if (!tipo || !zona || !asignado || !creadopor) {
        triggerToast('error', 'Completa Tipo de conteo, Zona, Asignado a y Creado por antes de guardar.');
        return;
    }

    if (!state.invTareas) state.invTareas = [];
    state.invTareas.push({ codigo, tipo, zona, asignado, creadopor, obs, fecha, estado: 'activa' });
    localStorage.setItem('aureo_inv_tareas', JSON.stringify(state.invTareas));

    triggerToast('success', `Tarea ${codigo} guardada correctamente.`);
    switchInventarioSub('panel');
}

function invLimpiarFormTarea() {
    ['inv-tarea-tipo', 'inv-tarea-zona', 'inv-tarea-asignado', 'inv-tarea-creadopor', 'inv-tarea-obs'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    invActualizarResumen();
}

let _mcTareas = [];

function filtrarMisConteos() {
    const asignado = (document.getElementById('mc-buscar-asignado')?.value || '').toLowerCase().trim();
    const estado = document.getElementById('mc-filtro-estado')?.value || 'todos';
    const tbody = document.getElementById('mc-tabla-body');
    if (!tbody) return;

    _mcTareas = [...(state.invTareas || [])].reverse().filter(t => {
        if (estado !== 'todos' && t.estado !== estado) return false;
        if (asignado && !(t.asignado || '').toLowerCase().includes(asignado)) return false;
        return true;
    });

    if (_mcTareas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">No se encontraron tareas.</td></tr>`;
        return;
    }

    const estadoBadge = e => {
        if (e === 'pendiente') return 'badge-warning';
        if (e === 'en proceso') return 'badge-success';
        if (e === 'reconteo pendiente') return 'badge-danger';
        if (e === 'conciliada') return 'badge-info';
        if (e === 'cerrada') return 'badge-secondary';
        return 'badge-info';
    };

    tbody.innerHTML = _mcTareas.map((t, idx) => `
        <tr onclick="seleccionarTareaMC(${idx})" id="mc-row-${idx}"
            style="cursor:pointer;">
            <td><span class="badge badge-info">${t.codigo || '—'}</span></td>
            <td>${t.tipo || '—'}</td>
            <td>${t.criterio || '—'}</td>
            <td>${t.asignado || '—'}</td>
            <td><span class="badge ${estadoBadge(t.estado)}">${t.estado || '—'}</span></td>
            <td>${t.reconteo || '—'}</td>
        </tr>
    `).join('');
}

function recargarMisConteos() {
    const inputAsignado = document.getElementById('mc-buscar-asignado');
    const selectEstado = document.getElementById('mc-filtro-estado');
    if (inputAsignado) inputAsignado.value = '';
    if (selectEstado) selectEstado.value = 'todos';
    _mcTareas = [];
    const panel = document.getElementById('mc-detalle-panel');
    if (panel) panel.innerHTML = `
        <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-muted);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
                style="width:40px;height:40px; margin:0 auto 0.75rem; display:block; opacity:0.35;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
            </svg>
            <p style="font-size:0.85rem;">Selecciona una tarea<br>para ver el detalle</p>
        </div>`;
    filtrarMisConteos();
}

function seleccionarTareaMC(idx) {
    document.querySelectorAll('#mc-tabla-body tr').forEach(r => r.classList.remove('row-selected'));
    const row = document.getElementById(`mc-row-${idx}`);
    if (row) row.classList.add('row-selected');
    renderDetalleRapidoMC(_mcTareas[idx]);
}

function renderDetalleRapidoMC(t) {
    const panel = document.getElementById('mc-detalle-panel');
    if (!panel || !t) return;

    const estadoBadge = e => {
        if (e === 'pendiente') return 'badge-warning';
        if (e === 'en proceso') return 'badge-success';
        if (e === 'reconteo pendiente') return 'badge-danger';
        if (e === 'conciliada') return 'badge-info';
        if (e === 'cerrada') return 'badge-secondary';
        return 'badge-info';
    };

    panel.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:1rem;">
            <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
                <span class="badge badge-info" style="font-size:0.9rem; padding:0.3rem 0.7rem;">${t.codigo || '—'}</span>
                <span class="badge ${estadoBadge(t.estado)}">${t.estado || '—'}</span>
            </div>

            <div class="kv-grid-2" style="display:grid; grid-template-columns:1fr 1fr; gap:0.6rem 0.9rem; font-size:0.82rem;">
                <div>
                    <div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:2px;">Tipo</div>
                    <div style="font-weight:500;">${t.tipo || '—'}</div>
                </div>
                <div>
                    <div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:2px;">Zona</div>
                    <div style="font-weight:500;">${t.zona || '—'}</div>
                </div>
                <div>
                    <div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:2px;">Asignado a</div>
                    <div style="font-weight:500;">${t.asignado || '—'}</div>
                </div>
                <div>
                    <div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:2px;">Creado por</div>
                    <div style="font-weight:500;">${t.creadopor || '—'}</div>
                </div>
                <div style="grid-column:1/-1;">
                    <div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:2px;">Fecha</div>
                    <div style="font-weight:500;">${t.fecha || '—'}</div>
                </div>
            </div>

            ${t.obs ? `
            <div style="font-size:0.81rem;">
                <div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:4px;">Observación</div>
                <div style="background:var(--bg-secondary,#f5f5f5); border-radius:6px; padding:0.6rem 0.75rem; color:var(--text-secondary); line-height:1.45;">${escapeHtml(t.obs)}</div>
            </div>` : ''}

            <div style="display:flex; flex-direction:column; gap:0.5rem; padding-top:0.5rem; border-top:1px solid var(--border-subtle);">
                <button class="btn btn-primary" style="justify-content:center; font-size:0.82rem;"
                    onclick="triggerToast('notif', 'La sección de Conteos Físicos estará disponible próximamente.');">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                        <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                    Ir a conteo
                </button>
                <button class="btn btn-secondary" style="justify-content:center; font-size:0.82rem;"
                    onclick="triggerToast('notif', 'La sección de Conciliación estará disponible próximamente.');">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                    </svg>
                    Ver conciliación
                </button>
                <button class="btn btn-secondary" style="justify-content:center; font-size:0.82rem;"
                    onclick="verInformeTarea('${t.codigo}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    Ver informe
                </button>
            </div>
        </div>
    `;
}

