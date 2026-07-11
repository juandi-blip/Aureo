// AUREO — DASHBOARD: KPIs, gráfico semanal de facturación, feed de transacciones recientes

// --- DASHBOARD RENDERING LOGIC ---
function renderDashboard() {
    // 1. Calculate stats metrics
    const totalRevenue = state.invoices
        .filter(inv => inv.status === 'paid')
        .reduce((sum, inv) => sum + inv.total, 0);

    const totalInvoices = state.invoices.length;
    const totalStock = state.products.reduce((sum, prod) => sum + Number(prod.stock), 0);
    const totalAlerts = state.products.filter(prod => Number(prod.stock) <= Number(prod.threshold)).length;

    // 2. Write numbers to HTML
    document.getElementById("stat-revenue").innerText = formatCurrency(totalRevenue);
    document.getElementById("stat-invoice-count").innerText = totalInvoices;
    document.getElementById("stat-total-stock").innerText = totalStock;
    document.getElementById("stat-alerts").innerText = totalAlerts;

    // Modify critical alert label visual style depending on level
    const alertLabel = document.getElementById("stat-alerts-severity");
    if (totalAlerts > 0) {
        alertLabel.innerText = "Stock Crítico";
        alertLabel.className = "stat-trend down";
    } else {
        alertLabel.innerText = "Sin Alertas";
        alertLabel.className = "stat-trend up";
    }
    // 3. Render recent invoices feed
    renderRecentInvoicesFeed();

    // 4. Render weekly billing chart with real data
    renderWeeklyChart();

    // 5. Render occupancy indices
    renderOccupancySection();

    // 6. Render freshness indicator
    renderFreshnessSection();

    // 7. Render proactive alerts panel (alerts.js) — recomputed on every render
    if (typeof renderAlertsSection === 'function') renderAlertsSection();
}

function renderRecentInvoicesFeed() {
    const listContainer = document.getElementById("dashboard-recent-invoices");
    listContainer.innerHTML = "";

    // Sort descending by date
    const sortedInvoices = [...state.invoices].slice(-4).reverse();

    if (sortedInvoices.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No hay registros de transacciones.</div>`;
        return;
    }

    sortedInvoices.forEach(inv => {
        const item = document.createElement("div");
        item.className = `activity-item ${inv.status === 'paid' ? 'invoice-paid' : 'invoice-pending'}`;

        let statusIcon = '';
        if (inv.status === 'paid') {
            statusIcon = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;
        } else {
            statusIcon = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
        }

        // Format date
        const invDate = new Date(inv.date);
        const dayStr = invDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

        item.innerHTML = `
            <div class="activity-details">
                <div class="activity-icon-box">
                    ${statusIcon}
                </div>
                <div class="activity-text-info">
                    <span class="activity-title">${escapeHtml(inv.clientName)}</span>
                    <span class="activity-time">${inv.id} &bull; ${dayStr}</span>
                </div>
            </div>
            <span class="activity-value">${formatCurrency(inv.total)}</span>
        `;

        listContainer.appendChild(item);
    });
}

// --- WEEKLY BILLING CHART ENGINE ---
function generateSmoothPath(points) {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpX = (prev.x + curr.x) / 2;
        d += ` C ${cpX},${prev.y} ${cpX},${curr.y} ${curr.x},${curr.y}`;
    }
    return d;
}

function renderWeeklyChart() {
    const Y_BASE = 170;
    const Y_TOP = 20;
    const X_POSITIONS = [40, 110, 180, 250, 320, 390, 460];
    const DAY_LABELS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const DAY_LABELS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    // Get Monday of the current week
    const today = new Date();
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);

    // Build date strings for this week and last week
    const thisWeekDates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d.toISOString().split('T')[0];
    });
    const lastWeekDates = thisWeekDates.map(dateStr => {
        const d = new Date(dateStr);
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
    });

    // Sum paid invoice totals per day
    const sumByDate = (dates) => dates.map(dateStr =>
        state.invoices
            .filter(inv => inv.date === dateStr && inv.status === 'paid')
            .reduce((sum, inv) => sum + inv.total, 0)
    );

    const dayTotals = sumByDate(thisWeekDates);
    const lastWeekTotals = sumByDate(lastWeekDates);

    const maxVal = Math.max(...dayTotals, 1);

    // Map totals to SVG Y coordinates (higher value = lower Y number)
    const points = X_POSITIONS.map((x, i) => ({
        x,
        y: dayTotals[i] > 0
            ? Math.round(Y_BASE - ((dayTotals[i] / maxVal) * (Y_BASE - Y_TOP)))
            : Y_BASE,
        val: dayTotals[i]
    }));

    // Generate and apply paths
    const linePath = generateSmoothPath(points);
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${Y_BASE} L ${points[0].x} ${Y_BASE} Z`;

    document.getElementById('chart-main-path').setAttribute('d', linePath);
    document.getElementById('chart-glow-path').setAttribute('d', linePath);
    document.getElementById('chart-area-path').setAttribute('d', areaPath);

    // Update dots position and tooltip callbacks
    const dots = document.querySelectorAll('#dashboard-trend-svg .chart-dot');
    dots.forEach((dot, i) => {
        if (i >= points.length) return;
        dot.setAttribute('cx', points[i].x);
        dot.setAttribute('cy', points[i].y);
        dot.setAttribute('data-val', points[i].val);
        dot.setAttribute('onclick',
            `showChartValue(this, '${DAY_LABELS_FULL[i]}', '${formatCurrency(points[i].val)}')`
        );
    });

    // Update X-axis day labels
    const textNodes = document.querySelectorAll('#dashboard-trend-svg text');
    textNodes.forEach((t, i) => {
        if (i < DAY_LABELS_SHORT.length) t.textContent = DAY_LABELS_SHORT[i];
    });

    // Update week range badge
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    document.getElementById('chart-legend-date').innerText = `${fmt(monday)} – ${fmt(sunday)}`;

    // Update revenue trend % vs last week
    const thisTotal = dayTotals.reduce((a, b) => a + b, 0);
    const lastTotal = lastWeekTotals.reduce((a, b) => a + b, 0);
    const trendEl = document.getElementById('stat-revenue-trend');
    if (trendEl) {
        let pctText, isUp;
        if (lastTotal > 0) {
            const pct = ((thisTotal - lastTotal) / lastTotal * 100).toFixed(1);
            isUp = Number(pct) >= 0;
            pctText = `${isUp ? '+' : ''}${pct}%`;
        } else if (thisTotal > 0) {
            isUp = true;
            pctText = '+100%';
        } else {
            isUp = true;
            pctText = '0%';
        }
        trendEl.className = `stat-trend ${isUp ? 'up' : 'down'}`;
        trendEl.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                <polyline points="${isUp ? '18 15 12 9 6 15' : '18 9 12 15 6 9'}" />
            </svg>
            ${pctText}`;
    }
}

// --- INTERACTIVE CHART ENGINE ---
function setupChartTooltipInteraction() {
    const chartTooltip = document.getElementById("chart-tooltip");
    const tooltipDay = document.getElementById("tooltip-day");
    const tooltipVal = document.getElementById("tooltip-val");

    window.showChartValue = function (element, day, val) {
        const rect = element.getBoundingClientRect();
        const containerRect = element.closest('.chart-container').getBoundingClientRect();

        tooltipDay.innerText = day;
        tooltipVal.innerText = val;

        // Position relative to chart-container
        chartTooltip.style.left = `${rect.left - containerRect.left - 40}px`;
        chartTooltip.style.top = `${rect.top - containerRect.top - 45}px`;
        chartTooltip.style.display = "block";

        // Light flash effect on selected dot
        document.querySelectorAll(".chart-dot").forEach(dot => {
            dot.setAttribute("r", "5");
            dot.style.fill = "var(--accent-gold)";
        });
        element.setAttribute("r", "7.5");
        element.style.fill = "var(--text-primary)";
    };

    // Close tooltip clicking outside
    document.addEventListener("click", (e) => {
        if (!e.target.classList.contains("chart-dot")) {
            chartTooltip.style.display = "none";
        }
    });
}
