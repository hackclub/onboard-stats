let projectsChartInstance = null;
let prChartInstance = null;

async function fetchData() {
    try {
        const response = await fetch('/data');
        if (!response.ok) {
            throw new Error('Network response was not ok ' + response.statusText);
        }
        return await response.json();
    } catch (error) {
        console.error('Fetch data failed:', error);
        return null;
    }
}

function renderChart(ctx, labels, datasets, type, title, unit, opts, chartInstance) {
    if (chartInstance) chartInstance.destroy();
    return new Chart(ctx, {
        type: type,
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 1000, easing: 'easeOutQuart' },
            plugins: {
                title: { display: true, text: title, font: { size: 16 }, color: '#e0e0e0' },
                legend: { display: true, labels: { color: '#e0e0e0' } }
            },
            scales: {
                x: {
                    stacked: opts.stacked,
                    type: 'time',
                    time: { unit: unit, tooltipFormat: 'll', displayFormats: { month: 'MMM YYYY' } },
                    adapters: { date: { locale: moment.locale() } },
                    ticks: { color: '#e0e0e0', maxRotation: 0, minRotation: 0, autoSkip: true, maxTicksLimit: 10 }
                },
                y: { stacked: opts.stacked, beginAtZero: true, ticks: { precision: 0, color: '#e0e0e0' } }
            }
        }
    });
}

async function main(tf) {
    const data = await fetchData();
    if (!data) return;

    const processData = (dataObj) => Object.entries(dataObj)
        .sort((a, b) => new Date(a[0]) - new Date(b[0]))
        .map(([date, count]) => ({ date: new Date(date), count }));

    const filterData = (dataArr) => dataArr.filter(entry => entry.count > 0);
    const filterByTf = (entries, months) => {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);
        return entries.filter(entry => entry.date >= startDate);
    };

    const projects = filterData(Object.values(data.projects).map(p => ({ date: new Date(p.date), count: p.subdirsCount })));
    const prs = processData(data.pull_requests);
    const stalledPrs = processData(data.stalled_pull_requests);

    const filteredProjects = filterByTf(projects, tf);
    const filteredPrs = filterByTf(prs, tf);
    const filteredStalledPrs = filterByTf(stalledPrs, tf);

    const projDates = filteredProjects.map(entry => entry.date);
    const projCounts = filteredProjects.map(entry => entry.count);

    const prDates = filteredPrs.map(entry => entry.date);
    const prCounts = filteredPrs.map(entry => entry.count);

    const stalledPrDates = filteredStalledPrs.map(entry => entry.date);
    const stalledPrCounts = filteredStalledPrs.map(entry => entry.count);

    const openPrCounts = prCounts.map((count, index) => count - (stalledPrCounts[index] || 0));

    const projCtx = document.getElementById('projectsChart').getContext('2d');
    projectsChartInstance = renderChart(projCtx, projDates, [{
        label: 'Funded Projects',
        data: projCounts,
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2,
        fill: true
    }], 'line', `Number of Funded Projects Over Time (Total: ${projCounts[projCounts.length - 1]})`, 'month', { stacked: false }, projectsChartInstance);

    const prCtx = document.getElementById('stalledPullRequestsChart').getContext('2d');
    prChartInstance = renderChart(prCtx, prDates, [
        {
            label: 'Stalled Pull Requests',
            data: stalledPrCounts,
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 2
        },
        {
            label: 'Open Pull Requests',
            data: openPrCounts,
            backgroundColor: 'rgba(153, 102, 255, 0.2)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 2
        }
    ], 'bar', `Open and Stalled Pull Requests (Open: ${openPrCounts[openPrCounts.length - 1]}, Stalled: ${stalledPrCounts[stalledPrCounts.length - 1]})`, 'day', { stacked: true }, prChartInstance);
}

main(1);

document.getElementById('timeframe').addEventListener('change', (event) => {
    const tf = parseInt(event.target.value, 10);
    main(tf);
});
