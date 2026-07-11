// AUREO — CLIENTES: CRM ligero derivado de facturación (perfil de cliente, historial de compras, notas)
// Este módulo es autocontenido a propósito: el próximo módulo (Alertas proactivas)
// leerá state.clients para detectar clientes inactivos, etc.

// --------------------------------------------------------------------------
//   UTILIDADES DE NORMALIZACIÓN / MATCHING
//   Un mismo cliente puede llegar con variaciones de mayúsculas/espacios en
//   el nombre; el NIT es la llave más confiable cuando está disponible.
// --------------------------------------------------------------------------
function _clientNormalize(str) {
    return (str || '').toString().trim().toLowerCase();
}

let _clientIdSeq = Date.now();
function _nextClientId() {
    _clientIdSeq += 1;
    return 'CLI-' + _clientIdSeq.toString(36).toUpperCase();
}

function findClientByNameNit(nombre, nit) {
    const nitKey = _clientNormalize(nit);
    const nameKey = _clientNormalize(nombre);
    if (nitKey) {
        const byNit = state.clients.find(c => c.nit && _clientNormalize(c.nit) === nitKey);
        if (byNit) return byNit;
    }
    if (nameKey) {
        const byName = state.clients.find(c => _clientNormalize(c.nombre) === nameKey);
        if (byName) return byName;
    }
    return null;
}

// --------------------------------------------------------------------------
//   MIGRACIÓN — se ejecuta una sola vez (cuando state.clients está vacío al
//   cargar) para derivar el catálogo de clientes a partir de las facturas
//   ya existentes en state.invoices.
// --------------------------------------------------------------------------
function migrateClientsFromInvoices() {
    if (!state.invoices || state.invoices.length === 0) return;

    const groups = {};
    state.invoices.forEach(inv => {
        const nombre = inv.clientName || 'Consumidor Final';
        const nit = inv.clientId || '';
        const nitKey = _clientNormalize(nit);
        const key = nitKey ? `nit:${nitKey}` : `name:${_clientNormalize(nombre)}`;

        if (!groups[key]) {
            groups[key] = { nombre, nit, firstDate: inv.date, lastDate: inv.date };
            return;
        }
        const g = groups[key];
        // El nombre/NIT vigente lo aporta la factura más reciente del grupo
        if (inv.date && (!g.lastDate || inv.date >= g.lastDate)) {
            g.nombre = nombre;
            g.nit = nit || g.nit;
            g.lastDate = inv.date;
        }
        if (inv.date && (!g.firstDate || inv.date < g.firstDate)) {
            g.firstDate = inv.date;
        }
    });

    Object.values(groups).forEach(g => {
        state.clients.push({
            id: _nextClientId(),
            nombre: g.nombre,
            nit: g.nit || '',
            notas: '',
            createdAt: g.firstDate || new Date().toISOString().split('T')[0]
        });
    });
}

// Se llama al despachar cada factura (invoicing.js). Si ya existe un cliente
// equivalente (mismo NIT o mismo nombre normalizado) no crea un duplicado;
// si el registro existente no tenía NIT, lo completa con el dato nuevo.
function ensureClientFromInvoice(nombre, nit) {
    if (!nombre || !nombre.trim()) return null;

    const existing = findClientByNameNit(nombre, nit);
    if (existing) {
        if (!existing.nit && nit) existing.nit = nit.trim();
        saveClientsToStorage();
        return existing;
    }

    const cliente = {
        id: _nextClientId(),
        nombre: nombre.trim(),
        nit: (nit || '').trim(),
        notas: '',
        createdAt: new Date().toISOString().split('T')[0]
    };
    state.clients.push(cliente);
    saveClientsToStorage();
    return cliente;
}

// --------------------------------------------------------------------------
//   ESTADÍSTICAS — calculadas al vuelo contra state.invoices (mismo patrón
//   que ABC/WMS: no se cachean, se recalculan en cada render).
// --------------------------------------------------------------------------
function getClientInvoices(cliente) {
    const nitKey = _clientNormalize(cliente.nit);
    const nameKey = _clientNormalize(cliente.nombre);
    return (state.invoices || []).filter(inv => {
        const invNitKey = _clientNormalize(inv.clientId);
        if (nitKey && invNitKey) return invNitKey === nitKey;
        return _clientNormalize(inv.clientName) === nameKey;
    });
}

function computeClientStats(cliente) {
    const invoices = getClientInvoices(cliente);
    const totalValue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    let lastDate = null;
    invoices.forEach(inv => {
        if (inv.date && (!lastDate || inv.date > lastDate)) lastDate = inv.date;
    });
    return { count: invoices.length, totalValue, lastDate, invoices };
}

// --------------------------------------------------------------------------
//   LISTADO / BÚSQUEDA
// --------------------------------------------------------------------------
let clientesSearchQuery = "";

function renderClientes() {
    const tbody = document.getElementById("clientes-table-body");
    if (!tbody) return;

    const q = clientesSearchQuery.toLowerCase();
    const filtered = (state.clients || []).filter(c =>
        c.nombre.toLowerCase().includes(q) || (c.nit || '').toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">
                    No se encontraron clientes registrados.
                </td>
            </tr>
        `;
        return;
    }

    // Ordenar por valor histórico descendente (clientes más valiosos primero)
    const withStats = filtered.map(c => ({ cliente: c, stats: computeClientStats(c) }));
    withStats.sort((a, b) => b.stats.totalValue - a.stats.totalValue);

    tbody.innerHTML = withStats.map(({ cliente, stats }) => `
        <tr>
            <td style="font-weight:600; color: var(--text-primary);">${escapeHtml(cliente.nombre)}</td>
            <td style="font-family:'JetBrains Mono',monospace; font-size:0.85rem;">${escapeHtml(cliente.nit) || '—'}</td>
            <td style="text-align:center;">${stats.count}</td>
            <td>${stats.lastDate || '—'}</td>
            <td style="text-align:right; font-family:'JetBrains Mono',monospace; font-weight:600; color: var(--text-primary);">
                ${formatCurrency(stats.totalValue)}
            </td>
            <td style="text-align: right;">
                <button class="btn btn-secondary btn-icon-only" onclick="openClientDetail('${cliente.id}')" title="Ver ficha del cliente">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                </button>
            </td>
        </tr>
    `).join('');
}

function filterClientes() {
    clientesSearchQuery = document.getElementById("clientes-search").value;
    renderClientes();
}

// --------------------------------------------------------------------------
//   DETALLE DE CLIENTE (modal) — historial de facturas + notas editables
// --------------------------------------------------------------------------
let activeClientDetailId = null;

function openClientDetail(id) {
    const cliente = (state.clients || []).find(c => c.id === id);
    if (!cliente) return;

    activeClientDetailId = id;
    const stats = computeClientStats(cliente);

    document.getElementById("client-detail-name").innerText = cliente.nombre;
    document.getElementById("client-detail-nit").innerText = cliente.nit || 'Sin NIT / identificación registrada';
    document.getElementById("client-detail-count").innerText = stats.count;
    document.getElementById("client-detail-last").innerText = stats.lastDate || '—';
    document.getElementById("client-detail-total").innerText = formatCurrency(stats.totalValue);
    document.getElementById("client-detail-notas").value = cliente.notas || '';

    const histBody = document.getElementById("client-detail-history-body");
    if (stats.invoices.length === 0) {
        histBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center; color: var(--text-muted); padding: 1.5rem 0;">
                    Este cliente aún no registra facturas.
                </td>
            </tr>
        `;
    } else {
        const sorted = [...stats.invoices].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        histBody.innerHTML = sorted.map(inv => `
            <tr>
                <td style="font-family:'JetBrains Mono',monospace; font-size:0.82rem;">${escapeHtml(inv.id)}</td>
                <td>${inv.date || '—'}</td>
                <td style="text-align:center;">${(inv.items || []).length}</td>
                <td style="text-align:right; font-weight:600;">${formatCurrency(inv.total || 0)}</td>
            </tr>
        `).join('');
    }

    document.getElementById("client-detail-modal").classList.add("active");
}

function closeClientDetail() {
    document.getElementById("client-detail-modal").classList.remove("active");
    activeClientDetailId = null;
}

function saveClientNotes() {
    if (!activeClientDetailId) return;
    const cliente = (state.clients || []).find(c => c.id === activeClientDetailId);
    if (!cliente) return;

    cliente.notas = document.getElementById("client-detail-notas").value;
    saveClientsToStorage();
    triggerToast("success", "Notas del cliente actualizadas correctamente.");
    renderClientes();
}

// --------------------------------------------------------------------------
//   AUTOCOMPLETADO en el formulario de facturación (Terminal Punto de Venta)
//   <datalist> nativo — sin dependencias, mismo nivel de simplicidad del resto.
// --------------------------------------------------------------------------
function populateClientDatalist() {
    const list = document.getElementById("clients-datalist");
    if (!list) return;
    list.innerHTML = (state.clients || [])
        .map(c => `<option value="${escapeHtml(c.nombre)}"></option>`)
        .join('');
}
