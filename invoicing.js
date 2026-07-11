// AUREO — INVOICING: motor de facturación dinámica (constructor de factura, totales, despacho)

// --- DYNAMIC INVOICING ENGINE ---
// Reset active builder state to default draft values
function initializeInvoiceBuilder() {
    state.invoiceItems = [];

    // Inject the current proforma number dynamically
    const nextFactNum = `FACT-${new Date().getFullYear()}-${String(state.invoices.length + 1).padStart(4, '0')}`;
    document.getElementById("preview-invoice-number").innerText = nextFactNum;

    // Default client parameters reset
    document.getElementById("invoice-client-name").value = "Juan Díaz";
    document.getElementById("invoice-client-id").value = "CC 79.845.922";

    // Genera un CUFE simulado (código único de facturación electrónica DIAN)
    updateSimulatedCufe();

    document.getElementById("invoice-discount").value = "0";
    document.getElementById("invoice-tax-rate").value = "19";
}

// Genera un CUFE simulado (Código Único de Factura Electrónica de la DIAN).
// NOTA: es un valor de DEMOSTRACIÓN — no aplica el algoritmo SHA-384 oficial
// sobre los campos reales de la factura ni firma con el certificado del
// facturador. Sirve para mostrar cómo se vería la facturación electrónica.
function updateSimulatedCufe() {
    const cufeEl = document.getElementById("preview-cufe");
    if (!cufeEl) return;
    const num = document.getElementById("preview-invoice-number").innerText;
    const seed = `${num}|${Date.now()}|${state.settings.taxId || ''}`;
    // Hash simple determinístico → cadena hex de 96 chars (formato visual del CUFE)
    let hex = '';
    for (let i = 0; i < 96; i++) {
        let h = 0;
        const s = seed + i;
        for (let c = 0; c < s.length; c++) { h = (h * 31 + s.charCodeAt(c)) & 0xffff; }
        hex += (h & 0xf).toString(16);
    }
    cufeEl.innerText = hex;
}

function populateProductSelector() {
    const selector = document.getElementById("invoice-product-selector");
    selector.innerHTML = "";

    // Load products with stock available
    const inStock = state.products.filter(p => p.stock > 0);

    if (inStock.length === 0) {
        selector.innerHTML = `<option value="">No hay suministros disponibles (Stock Agotado)</option>`;
        return;
    }

    inStock.forEach(prod => {
        const option = document.createElement("option");
        option.value = prod.id;
        option.innerText = `${prod.name} (${formatCurrency(prod.price)} - stock: ${prod.stock})`;
        selector.appendChild(option);
    });
}

function addInvoiceItem() {
    const selector = document.getElementById("invoice-product-selector");
    const qtyInput = document.getElementById("invoice-product-qty");

    const productId = selector.value;
    const qty = parseInt(qtyInput.value);

    if (!productId || qty <= 0) {
        triggerToast("error", "Por favor selecciona un artículo y cantidad válida.");
        return;
    }

    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    // Stock boundary condition checks
    const currentQtyInBuilder = state.invoiceItems
        .filter(item => item.productId === productId)
        .reduce((sum, item) => sum + item.qty, 0);

    if (qty + currentQtyInBuilder > product.stock) {
        triggerToast("error", `Existencias insuficientes en patio. Máximo disponible: ${product.stock} uds.`);
        return;
    }

    // Check if product already exists in item builder
    const existingIndex = state.invoiceItems.findIndex(item => item.productId === productId);
    if (existingIndex !== -1) {
        state.invoiceItems[existingIndex].qty += qty;
    } else {
        state.invoiceItems.push({
            productId: product.id,
            name: product.name,
            price: product.price,
            qty: qty
        });
    }

    qtyInput.value = "1";
    triggerToast("success", `Despachando: ${qty}x ${escapeHtml(product.name)}`);

    renderInvoiceBuilderItems();
    calculateInvoiceTotals();
}

function removeInvoiceItem(productId) {
    state.invoiceItems = state.invoiceItems.filter(item => item.productId !== productId);
    renderInvoiceBuilderItems();
    calculateInvoiceTotals();
}

function changeBuilderItemQty(productId, newQty) {
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty <= 0) return;

    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    if (qty > product.stock) {
        triggerToast("error", `Existencias insuficientes. Límite: ${product.stock}`);
        renderInvoiceBuilderItems();
        return;
    }

    const index = state.invoiceItems.findIndex(item => item.productId === productId);
    if (index !== -1) {
        state.invoiceItems[index].qty = qty;
    }

    calculateInvoiceTotals();
    updateInvoicePreview();
}

function renderInvoiceBuilderItems() {
    const tbody = document.getElementById("invoice-builder-items");
    tbody.innerHTML = "";

    if (state.invoiceItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem 0;">
                    El comprobante no tiene conceptos registrados.
                </td>
            </tr>
        `;
        return;
    }

    state.invoiceItems.forEach(item => {
        const tr = document.createElement("tr");
        const itemTotal = item.price * item.qty;

        tr.innerHTML = `
            <td>
                <span style="font-weight:600; display:block; color: var(--text-primary);">${escapeHtml(item.name)}</span>
            </td>
            <td style="text-align: center;">
                <div class="quantity-control">
                    <input type="number" class="qty-input" value="${item.qty}" min="1" 
                           onchange="changeBuilderItemQty('${item.productId}', this.value)">
                </div>
            </td>
            <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 0.9rem;">
                ${formatCurrency(item.price)}
            </td>
            <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight:600; color:var(--text-primary); font-size: 0.9rem;">
                ${formatCurrency(itemTotal)}
            </td>
            <td style="text-align: right;">
                <button class="btn btn-secondary btn-icon-only" onclick="removeInvoiceItem('${item.productId}')" style="border-color: rgba(255,42,95,0.15); color: var(--accent-rose);">
                    <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function calculateInvoiceTotals() {
    const subtotal = state.invoiceItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const discountPct = parseFloat(document.getElementById("invoice-discount").value);
    const discountVal = subtotal * (discountPct / 100);
    const subtotalWithDisc = subtotal - discountVal;

    const taxRate = parseFloat(document.getElementById("invoice-tax-rate").value);
    const taxVal = subtotalWithDisc * (taxRate / 100);
    const grandTotal = subtotalWithDisc + taxVal;

    // Save draft temporary totals
    state.currentCalculations = {
        subtotal,
        discountPct,
        discountVal,
        taxRate,
        taxVal,
        grandTotal
    };

    // Redraw live preview
    updateInvoicePreview();
}

function updateInvoicePreview() {
    const clientName = document.getElementById("invoice-client-name").value || "Consumidor Final";
    const clientId = document.getElementById("invoice-client-id").value || "N/A";

    document.getElementById("preview-client-name").innerText = clientName;
    document.getElementById("preview-client-id").innerText = clientId;

    const calc = state.currentCalculations || { subtotal: 0, discountPct: 0, discountVal: 0, taxRate: 19, taxVal: 0, grandTotal: 0 };

    document.getElementById("preview-subtotal").innerText = formatCurrency(calc.subtotal);
    document.getElementById("preview-discount-label").innerText = `Descuento (${calc.discountPct}%)`;
    document.getElementById("preview-discount-val").innerText = `-${formatCurrency(calc.discountVal)}`;
    document.getElementById("preview-tax-label").innerText = `I.V.A (${calc.taxRate}%)`;
    document.getElementById("preview-tax-val").innerText = formatCurrency(calc.taxVal);
    document.getElementById("preview-grand-total").innerText = formatCurrency(calc.grandTotal);

    // Render dynamic listing on ticket receipt
    const receiptItemsContainer = document.getElementById("preview-items-list");
    receiptItemsContainer.innerHTML = "";

    if (state.invoiceItems.length === 0) {
        receiptItemsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.82rem; padding: 1.75rem 0;">Esperando códigos en cinta...</div>`;
        return;
    }

    state.invoiceItems.forEach(item => {
        const row = document.createElement("div");
        row.className = "summary-item-row";
        row.innerHTML = `
            <div>
                <div class="summary-item-name">${escapeHtml(item.name)}</div>
                <div class="summary-item-qty-price">${item.qty} uds x ${formatCurrency(item.price)}</div>
            </div>
            <div class="summary-item-total">${formatCurrency(item.price * item.qty)}</div>
        `;
        receiptItemsContainer.appendChild(row);
    });
}

function commitInvoiceTransaction() {
    if (state.invoiceItems.length === 0) {
        triggerToast("error", "No se puede despachar una factura vacía sin conceptos.");
        return;
    }

    const clientName = document.getElementById("invoice-client-name").value;
    const clientId = document.getElementById("invoice-client-id").value;

    if (!clientName.trim()) {
        triggerToast("error", "Por favor ingresa una razón social o cliente válido.");
        return;
    }

    const calc = state.currentCalculations;
    const invoiceId = document.getElementById("preview-invoice-number").innerText;
    const todayStr = new Date().toISOString().split('T')[0];

    // Create definitive invoice model
    const definitiveInvoice = {
        id: invoiceId,
        clientName,
        clientId,
        date: todayStr,
        items: [...state.invoiceItems],
        subtotal: calc.subtotal,
        discountPct: calc.discountPct,
        discountVal: calc.discountVal,
        taxRate: calc.taxRate,
        taxVal: calc.taxVal,
        total: calc.grandTotal,
        status: "paid"
    };

    // Deduct stock quantities from inventory state
    state.invoiceItems.forEach(item => {
        const productIndex = state.products.findIndex(p => p.id === item.productId);
        if (productIndex !== -1) {
            state.products[productIndex].stock = Math.max(0, state.products[productIndex].stock - item.qty);
        }
    });

    // Insert into state and persist
    state.invoices.push(definitiveInvoice);
    saveInvoicesToStorage();
    saveProductsToStorage();

    // Vincular con el CRM ligero: si el cliente ya existe (mismo NIT o nombre) no
    // se duplica; si es nuevo, se crea el registro de Cliente automáticamente.
    if (typeof ensureClientFromInvoice === 'function') {
        ensureClientFromInvoice(clientName, clientId);
    }

    // Generar automáticamente la lista de preparación de pedido (picking)
    const newList = generatePickingFromInvoice(definitiveInvoice, { silent: true });

    triggerToast("success", `Despacho ${invoiceId} procesado. Lista de preparación ${newList ? newList.id : ''} creada.`);

    // Reset invoice builder
    initializeInvoiceBuilder();
    renderInvoiceBuilderItems();
    calculateInvoiceTotals();

    // Redirect to dashboard to check transaction
    setTimeout(() => {
        switchTab('dashboard');
    }, 1200);
}

