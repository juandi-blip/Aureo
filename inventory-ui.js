// AUREO — INVENTORY UI: tabla/CRUD de productos, modal de creación/edición

// --- INVENTORY MANAGEMENT DRIVER ---
let inventorySearchQuery = "";
let inventoryCategoryFilter = "all";

function renderInventory() {
    const tableBody = document.getElementById("inventory-table-body");
    tableBody.innerHTML = "";

    const filteredProducts = state.products.filter(prod => {
        const matchesSearch = prod.name.toLowerCase().includes(inventorySearchQuery.toLowerCase()) ||
            prod.sku.toLowerCase().includes(inventorySearchQuery.toLowerCase()) ||
            prod.brand.toLowerCase().includes(inventorySearchQuery.toLowerCase());
        const matchesCategory = inventoryCategoryFilter === 'all' || prod.category === inventoryCategoryFilter;
        return matchesSearch && matchesCategory;
    });

    if (filteredProducts.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">
                    No se encontraron mercancías ni herramientas registradas.
                </td>
            </tr>
        `;
        return;
    }

    filteredProducts.forEach(prod => {
        const tr = document.createElement("tr");

        // Stock status identification
        let badgeClass = 'badge-success';
        let badgeLabel = 'Operativo';
        let pct = (prod.stock / 50) * 100; // max reference 50 items
        if (pct > 100) pct = 100;

        let fillStyle = 'background: var(--accent-emerald-gradient);';

        if (Number(prod.stock) === 0) {
            badgeClass = 'badge-danger';
            badgeLabel = 'Agotado';
            fillStyle = 'background: var(--accent-rose-gradient);';
        } else if (Number(prod.stock) <= Number(prod.threshold)) {
            badgeClass = 'badge-warning';
            badgeLabel = 'Stock Crítico';
            fillStyle = 'background: var(--accent-gold-gradient);';
        }

        // Dynamic icons based on industrial category
        let categorySvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;

        if (prod.category === 'Herramientas Eléctricas') {
            categorySvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`; // Lightning bolt
        } else if (prod.category === 'Consumibles') {
            categorySvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`; // Grinding disc / Globe
        } else if (prod.category === 'Herramientas Manuales') {
            categorySvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`; // Wrench
        } else if (prod.category === 'Fijaciones') {
            categorySvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v15M10 14h4M9 9h6"/></svg>`; // Screw / Bolt
        } else if (prod.category === 'Maquinaria Pesada') {
            categorySvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>`; // Machine box
        }

        // Calculate remaining shelf life / inspection in days
        let shelfLifeText = 'Sin límite';
        let shelfLifeClass = 'badge-info';

        if (prod.expDate) {
            const expDateObj = new Date(prod.expDate + 'T00:00:00');
            const currentDate = new Date();
            expDateObj.setHours(0, 0, 0, 0);
            currentDate.setHours(0, 0, 0, 0);

            const diffTime = expDateObj.getTime() - currentDate.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                shelfLifeText = `Reinspección Vencida (${Math.abs(diffDays)} d)`;
                shelfLifeClass = 'badge-danger';
            } else if (diffDays === 0) {
                shelfLifeText = 'Calibrar Hoy';
                shelfLifeClass = 'badge-warning';
            } else {
                shelfLifeText = `${diffDays} d p/inspección`;
                shelfLifeClass = diffDays <= 60 ? 'badge-warning' : 'badge-success';
            }
        }

        const fabFormatted = prod.mfgDate ? prod.mfgDate : 'N/D';
        const vencFormatted = prod.expDate ? prod.expDate : 'N/D';
        const lotFormatted = prod.lot ? prod.lot : 'N/D';

        tr.innerHTML = `
            <td style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:0.82rem;white-space:nowrap;color:var(--text-primary);">
                ${escapeHtml(prod.sku) || '—'}
            </td>
            <td>
                <div class="product-cell">
                    <div class="product-image-placeholder">
                        ${categorySvg}
                    </div>
                    <div class="product-meta-info">
                        <span class="product-name">${escapeHtml(prod.name)}</span>
                        <span class="product-sku"><strong style="color:var(--accent-gold);font-size:0.7rem;">${escapeHtml(prod.brand)}</strong></span>
                    </div>
                </div>
            </td>
            <td style="font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 0.85rem;">
                ${escapeHtml(lotFormatted)}
            </td>
            <td>
                <span style="font-weight: 600; font-family:'Rajdhani'; font-size: 0.95rem;">${escapeHtml(prod.category)}</span>
            </td>
            <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--text-primary);">
                ${formatCurrency(prod.price)}
            </td>
            <td>
                <div class="stock-bar-container">
                    <div class="stock-bar-label">
                        <span style="font-weight:700;">${prod.stock} uds</span>
                        <span style="color: var(--text-muted); font-size: 0.75rem;">${Math.round(pct)}%</span>
                    </div>
                    <div class="stock-bar-track">
                        <div class="stock-bar-fill" style="width: ${pct}%; ${fillStyle}"></div>
                    </div>
                </div>
            </td>
            <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; line-height: 1.4;">
                <div style="color: var(--text-secondary);">Rec: ${fabFormatted}</div>
                <div style="color: var(--accent-gold);">Ctrl: ${vencFormatted}</div>
            </td>
            <td>
                <span class="badge ${shelfLifeClass}">${shelfLifeText}</span>
            </td>
            <td>
                <span class="badge ${badgeClass}">${badgeLabel}</span>
            </td>
            <td style="text-align: right;">
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                    <button class="btn btn-secondary btn-icon-only" onclick="openProductModal('${prod.id}')" title="Modificar Ficha">
                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
                    </button>
                    <button class="btn btn-danger btn-icon-only" onclick="deleteProduct('${prod.id}')" title="Dar de Baja">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </div>
            </td>
        `;

        tableBody.appendChild(tr);
    });
}

function filterInventory() {
    inventorySearchQuery = document.getElementById("inventory-search").value;
    inventoryCategoryFilter = document.getElementById("inventory-category-filter").value;
    renderInventory();
}

function deleteProduct(id) {
    const prod = state.products.find(p => p.id === id);
    if (!prod) return;

    if (confirm(`¿Estás seguro de que deseas dar de baja el artículo "${prod.name}" del catálogo central?`)) {
        state.products = state.products.filter(p => p.id !== id);
        saveProductsToStorage();
        renderInventory();
        triggerToast("success", `Artículo "${escapeHtml(prod.name)}" eliminado correctamente.`);
    }
}

// --- PRODUCT CREATION / EDIT MODAL LOGIC ---
function openProductModal(productId = null) {
    const modal = document.getElementById("product-modal");
    const modalTitle = document.getElementById("product-modal-title");
    const form = document.getElementById("product-form");

    form.reset();
    document.getElementById("product-modal-id").value = "";

    if (productId) {
        // Mode: EDIT
        const prod = state.products.find(p => p.id === productId);
        if (!prod) return;

        modalTitle.innerText = "Modificar Ficha Técnica del Artículo";
        document.getElementById("product-modal-id").value = prod.id;
        document.getElementById("product-modal-name").value = prod.name;
        document.getElementById("product-modal-sku").value = prod.sku;
        document.getElementById("product-modal-category").value = prod.category;
        document.getElementById("product-modal-price").value = prod.price;
        document.getElementById("product-modal-stock").value = prod.stock;
        document.getElementById("product-modal-threshold").value = prod.threshold;

        // Additional batch & expiry details
        document.getElementById("product-modal-lot").value = prod.lot || "";
        document.getElementById("product-modal-mfg-date").value = prod.mfgDate || "";
        document.getElementById("product-modal-exp-date").value = prod.expDate || "";

        // WMS Location & Brand fields
        document.getElementById("product-modal-warehouse").value = prod.warehouse || "Bodega Principal";
        document.getElementById("product-modal-aisle").value = prod.aisle || "C";
        document.getElementById("product-modal-shelf").value = prod.shelf || 1;
        document.getElementById("product-modal-level").value = prod.level || 1;
        document.getElementById("product-modal-distance").value = prod.pickingDistance || 25;
        document.getElementById("product-modal-brand").value = prod.brand || "";
        document.getElementById("product-modal-supplier").value = prod.supplier || "";
    } else {
        // Mode: CREATE
        modalTitle.innerText = "Registrar Nuevo Suministro Industrial";

        // Auto-generate cool default SKU
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        document.getElementById("product-modal-sku").value = `SKU-VF-${randomNum}`;

        // Auto-generate default Lot number
        const randomLot = Math.floor(100 + Math.random() * 900);
        document.getElementById("product-modal-lot").value = `LT-${randomLot}`;

        // Default manufacturing/reception date to today's date
        const todayStr = new Date().toISOString().split('T')[0];
        document.getElementById("product-modal-mfg-date").value = todayStr;

        // Default calibration inspection date to 1 year from now
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        const nextYearStr = nextYear.toISOString().split('T')[0];
        document.getElementById("product-modal-exp-date").value = nextYearStr;
    }

    modal.classList.add("active");
}

function closeProductModal() {
    document.getElementById("product-modal").classList.remove("active");
}

function saveProductForm(event) {
    event.preventDefault();

    const id = document.getElementById("product-modal-id").value;
    const name = document.getElementById("product-modal-name").value;
    const sku = document.getElementById("product-modal-sku").value;
    const category = document.getElementById("product-modal-category").value;
    const price = parseFloat(document.getElementById("product-modal-price").value);
    const stock = parseInt(document.getElementById("product-modal-stock").value);
    const threshold = parseInt(document.getElementById("product-modal-threshold").value);

    // Read batch and expiry inputs
    const lot = document.getElementById("product-modal-lot").value;
    const mfgDate = document.getElementById("product-modal-mfg-date").value;
    const expDate = document.getElementById("product-modal-exp-date").value;

    // Read WMS location & brand inputs
    const warehouse = document.getElementById("product-modal-warehouse").value;
    const aisle = document.getElementById("product-modal-aisle").value;
    const shelf = parseInt(document.getElementById("product-modal-shelf").value) || 1;
    const level = parseInt(document.getElementById("product-modal-level").value) || 1;
    const pickingDistance = parseInt(document.getElementById("product-modal-distance").value) || 25;
    const brand = document.getElementById("product-modal-brand").value;
    const supplier = document.getElementById("product-modal-supplier").value;

    const productData = { name, sku, category, price, stock, threshold, lot, mfgDate, expDate, warehouse, aisle, shelf, level, pickingDistance, brand, supplier };

    if (id) {
        // Edit existing product
        const index = state.products.findIndex(p => p.id === id);
        if (index !== -1) {
            state.products[index] = { id, ...productData };
            triggerToast("success", `Artículo "${escapeHtml(name)}" actualizado con éxito.`);
        }
    } else {
        // Create new product
        state.products.push({ id: Date.now().toString(), ...productData });
        triggerToast("success", `Artículo "${escapeHtml(name)}" ingresado correctamente.`);
    }

    saveProductsToStorage();
    closeProductModal();
    renderInventory();
}

