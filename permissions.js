// AUREO — PERMISOS GRANULARES: roles configurables y accesos por pestaña (panel admin-only en Configuración)
// Este módulo NO decide qué puede ver cada usuario en tiempo real (eso lo hace
// auth.js con getStoredRoles()/getAllowedTabs() en cada login); acá solo se
// EDITA el storage que auth.js consume. Los cambios hechos aquí aplican en el
// próximo inicio de sesión del rol afectado (igual que cambiar credenciales).

// Lista canónica de módulos/pestañas del sistema (debe reflejar el mismo
// listado que auth.js usa en `allTabs` para mostrar/ocultar el sidebar).
const PERMISOS_TABS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'inventory', label: 'Depósito Central (Inventario)' },
    { id: 'invoicing', label: 'Facturación (Terminal POS)' },
    { id: 'clientes', label: 'Clientes' },
    { id: 'logistics', label: 'Logística / WMS' },
    { id: 'picking', label: 'Picking' },
    { id: 'dataentry', label: 'Ingreso de Datos' },
    { id: 'inventario', label: 'Inventario (Conteos Físicos)' },
    { id: 'reports', label: 'Reportes' },
    { id: 'settings', label: 'Configuración' }
];

// Borrador en memoria: { roleId: Set(tabIds) }. Se descarta si no se guarda.
let _permisosDraft = {};

function _permisosIsAdmin() {
    const session = (typeof getVulcanSession === 'function') ? getVulcanSession() : null;
    return !!(session && session.role === 'admin');
}

// --------------------------------------------------------------------------
//   RENDER PRINCIPAL — tabla de roles (columnas) × módulos (filas)
// --------------------------------------------------------------------------
function renderPermisos() {
    const card = document.getElementById('permisos-card');
    if (!card) return;

    if (!_permisosIsAdmin()) {
        card.style.display = 'none';
        return;
    }
    card.style.display = '';

    const roles = (typeof getStoredRoles === 'function') ? getStoredRoles() : [];
    _permisosDraft = {};
    roles.forEach(r => { _permisosDraft[r.id] = new Set(Array.isArray(r.tabs) ? r.tabs : []); });

    const wrap = document.getElementById('permisos-table-wrap');
    if (!wrap) return;

    let html = '<table class="custom-table" id="permisos-table"><thead><tr><th>Módulo</th>';
    roles.forEach(r => {
        html += `<th style="text-align:center;">
            <div style="display:flex; align-items:center; justify-content:center; gap:0.35rem;">
                <span>${escapeHtml(r.name)}</span>
                ${!r.builtIn ? `<button type="button" class="btn btn-secondary btn-icon-only" title="Eliminar rol"
                    style="width:1.6rem; height:1.6rem; padding:0;" onclick="deleteCustomRole('${escapeHtml(r.id)}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:0.85rem;height:0.85rem;">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>` : ''}
            </div>
        </th>`;
    });
    html += '</tr></thead><tbody>';

    PERMISOS_TABS.forEach(tab => {
        html += `<tr><td>${escapeHtml(tab.label)}</td>`;
        roles.forEach(r => {
            const checked = _permisosDraft[r.id].has(tab.id) ? 'checked' : '';
            html += `<td style="text-align:center;">
                <input type="checkbox" ${checked}
                    onchange="togglePermisoTab('${escapeHtml(r.id)}','${tab.id}', this.checked)">
            </td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;

    _renderUserRoleAssignments(roles);
}

function togglePermisoTab(roleId, tabId, checked) {
    if (!_permisosDraft[roleId]) return;
    if (checked) _permisosDraft[roleId].add(tabId);
    else _permisosDraft[roleId].delete(tabId);
}

function savePermisos() {
    const roles = (typeof getStoredRoles === 'function') ? getStoredRoles() : [];

    // No dejar que el propio rol admin pierda acceso a Configuración: se
    // bloquearía a sí mismo (y a cualquier otro admin) fuera de este panel.
    if (_permisosDraft.admin && !_permisosDraft.admin.has('settings')) {
        triggerToast('error', 'El rol Administrador debe conservar acceso a Configuración.');
        return;
    }

    roles.forEach(r => {
        if (_permisosDraft[r.id]) r.tabs = Array.from(_permisosDraft[r.id]);
    });

    saveStoredRoles(roles);
    if (typeof state !== 'undefined') state.roles = roles;

    triggerToast('success', 'Permisos actualizados. Los cambios aplican en el próximo inicio de sesión de cada rol.');
    renderPermisos();
}

// --------------------------------------------------------------------------
//   AGREGAR ROL PERSONALIZADO
// --------------------------------------------------------------------------
function openAddRoleModal() {
    const nameInput = document.getElementById('add-role-name');
    if (nameInput) nameInput.value = '';

    const wrap = document.getElementById('add-role-tabs-wrap');
    if (wrap) {
        wrap.innerHTML = PERMISOS_TABS.map(t => `
            <label style="display:flex; align-items:center; gap:0.5rem; padding:0.3rem 0; font-size:0.9rem;">
                <input type="checkbox" value="${t.id}" class="add-role-tab-cb">
                ${escapeHtml(t.label)}
            </label>
        `).join('');
    }

    document.getElementById('add-role-modal').classList.add('active');
}

function closeAddRoleModal() {
    document.getElementById('add-role-modal').classList.remove('active');
}

function createCustomRole(event) {
    event.preventDefault();

    const nameInput = document.getElementById('add-role-name');
    const name = (nameInput.value || '').trim();
    if (!name) {
        triggerToast('error', 'Ingresa un nombre para el nuevo rol.');
        return;
    }

    const roles = getStoredRoles();
    if (roles.some(r => r.name.trim().toLowerCase() === name.toLowerCase())) {
        triggerToast('error', 'Ya existe un rol con ese nombre.');
        return;
    }

    const selectedTabs = Array.from(document.querySelectorAll('.add-role-tab-cb:checked')).map(cb => cb.value);
    const id = 'role_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    roles.push({ id, name, tabs: selectedTabs, builtIn: false });
    saveStoredRoles(roles);
    if (typeof state !== 'undefined') state.roles = roles;

    closeAddRoleModal();
    triggerToast('success', `Rol "${name}" creado correctamente.`);
    renderPermisos();
}

function deleteCustomRole(roleId) {
    const roles = getStoredRoles();
    const role = roles.find(r => r.id === roleId);
    if (!role) return;

    // Protección de roles predeterminados: no se puede eliminar admin/warehouse/cashier
    // (evita que el sistema quede sin ningún administrador o rol base funcional).
    if (role.builtIn) {
        triggerToast('error', 'No se puede eliminar un rol predeterminado del sistema.');
        return;
    }

    if (!confirm(`¿Eliminar el rol "${role.name}"? Esta acción no se puede deshacer.`)) return;

    const remaining = roles.filter(r => r.id !== roleId);
    saveStoredRoles(remaining);
    if (typeof state !== 'undefined') state.roles = remaining;

    // Si algún usuario demo tenía este rol asignado, revertirlo a su rol original
    // para no dejarlo "huérfano" apuntando a un rol que ya no existe.
    if (typeof getUserRoleOverrides === 'function') {
        const overrides = getUserRoleOverrides();
        let changed = false;
        Object.keys(overrides).forEach(username => {
            if (overrides[username] === roleId) {
                delete overrides[username];
                changed = true;
            }
        });
        if (changed) saveUserRoleOverrides(overrides);
    }

    triggerToast('success', 'Rol eliminado.');
    renderPermisos();
}

// --------------------------------------------------------------------------
//   ASIGNAR ROL A USUARIO — alcance acotado: los 3 usuarios demo hardcodeados
//   en VULCAN_USERS (no hay gestión de usuarios/CRUD, solo reasignación de rol).
// --------------------------------------------------------------------------
function _renderUserRoleAssignments(roles) {
    const wrap = document.getElementById('permisos-user-assign-wrap');
    if (!wrap) return;
    if (typeof VULCAN_USERS === 'undefined') { wrap.innerHTML = ''; return; }

    const overrides = (typeof getUserRoleOverrides === 'function') ? getUserRoleOverrides() : {};

    wrap.innerHTML = VULCAN_USERS.map(u => {
        const currentRole = overrides[u.username] || u.role;
        const options = roles.map(r =>
            `<option value="${escapeHtml(r.id)}" ${r.id === currentRole ? 'selected' : ''}>${escapeHtml(r.name)}</option>`
        ).join('');
        return `
            <div class="form-row" style="align-items:flex-end;">
                <div class="form-group" style="margin-bottom:0.5rem;">
                    <label class="form-label">Usuario</label>
                    <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(u.name)} <span style="color:var(--text-muted); font-weight:400;">(${escapeHtml(u.username)})</span></div>
                </div>
                <div class="form-group" style="margin-bottom:0.5rem;">
                    <label class="form-label" for="assign-role-${escapeHtml(u.username)}">Rol asignado</label>
                    <select class="form-select" id="assign-role-${escapeHtml(u.username)}">
                        ${options}
                    </select>
                </div>
            </div>
        `;
    }).join('');
}

function saveUserRoleAssignments() {
    if (typeof VULCAN_USERS === 'undefined') return;

    const overrides = (typeof getUserRoleOverrides === 'function') ? getUserRoleOverrides() : {};
    VULCAN_USERS.forEach(u => {
        const select = document.getElementById(`assign-role-${u.username}`);
        if (!select) return;
        if (select.value === u.role) {
            delete overrides[u.username];
        } else {
            overrides[u.username] = select.value;
        }
    });

    saveUserRoleOverrides(overrides);
    triggerToast('success', 'Asignación de roles actualizada. Aplica en el próximo inicio de sesión.');
}
