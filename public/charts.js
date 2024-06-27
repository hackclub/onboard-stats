async function fetchData() {
    try {
        const response = await fetch('/data');
        if (!response.ok) {
            throw new Error('Network response was not ok ' + response.statusText);
        }
        const data = await response.json();
        console.log('Fetched data:', data);
        return data;
    } catch (error) {
        console.error('Fetch data failed:', error);
        return null;
    }
}

function renderChart(ctx, labels, data, type, title, unit, colors, callback) {
    console.log('Rendering chart:', title);

    const chart = new Chart(ctx, {
        type: type,
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderWidth: 2,
                pointBackgroundColor: colors.pointBackground,
                pointBorderColor: colors.pointBorder,
                pointRadius: 3,
                pointHoverRadius: 5,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return context.raw;
                        }
                    }
                },
                title: {
                    display: true,
                    text: title,
                    font: {
                        size: 16
                    }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: unit,
                        tooltipFormat: 'll',
                        displayFormats: {
                            month: 'MMM YYYY'
                        }
                    },
                    adapters: {
                        date: {
                            locale: moment.locale()
                        }
                    },
                    ticks: {
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 10
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            },
            animation: {
                onComplete: function () {
                    const base64Image = chart.toBase64Image();
                    return base64Image;
                }
            }
        }
    });
}

async function main() {
    const data = await fetchData();
    if (!data) {
        console.log('No data fetched');
        return;
    }

    const projectsData = Object.values(data.projects).sort((a, b) => new Date(a.date) - new Date(b.date));
    const pullRequestsData = Object.entries(data.pull_requests).sort((a, b) => new Date(a[0]) - new Date(b[0]));
    const stalledPullRequestsData = Object.entries(data.stalled_pull_requests).sort((a, b) => new Date(a[0]) - new Date(b[0]));
    
    // console.log('Processed projectsData:', projectsData);
    // console.log('Processed pullRequestsData:', pullRequestsData);

    const filteredProjectsData = projectsData.filter(entry => entry.subdirsCount > 0);
    const filteredPullRequestsData = pullRequestsData.filter(entry => entry[1] > 0);
    const filteredStalledPullRequestsData = stalledPullRequestsData.filter(entry => entry[1] > 0);

    const projectDates = filteredProjectsData.map(entry => new Date(entry.date));
    const projectCounts = filteredProjectsData.map(entry => entry.subdirsCount);
    const prDates = filteredPullRequestsData.map(entry => new Date(entry[0]));
    const prCounts = filteredPullRequestsData.map(entry => entry[1]);
    const stalledPrDates = filteredStalledPullRequestsData.map(entry => new Date(entry[0]));
    const stalledPrCounts = filteredStalledPullRequestsData.map(entry => entry[1]);

    // console.log('Filtered projectDates:', projectDates);
    // console.log('Filtered projectCounts:', projectCounts);
    // console.log('Filtered prDates:', prDates);
    // console.log('Filtered prCounts:', prCounts);

    const totalGrants = projectCounts[projectCounts.length - 1];
    const totalOpenPRs = prCounts[prCounts.length - 1];
    const totalStalledPRs = stalledPrCounts[stalledPrCounts.length - 1];

    // console.log('Total grants:', totalGrants);
    // console.log('Total open PRs:', totalOpenPRs);

    const projectsCtx = document.getElementById('projectsChart').getContext('2d');
    renderChart(projectsCtx, projectDates, projectCounts, 'line', `Number of Funded Projects Over Time (Total number of grants given = ${totalGrants})`, 'month', {
        background: 'rgba(75, 192, 192, 0.2)',
        border: 'rgba(75, 192, 192, 1)',
        pointBackground: 'rgba(75, 192, 192, 1)',
        pointBorder: 'rgba(75, 192, 192, 1)'
    });

    const prCtx = document.getElementById('pullRequestsChart').getContext('2d');
    renderChart(prCtx, prDates, prCounts, 'bar', `Number of Open Pull Requests Over Time (Total number of open PRs = ${totalOpenPRs})`, 'day', {
        background: 'rgba(153, 102, 255, 0.2)',
        border: 'rgba(153, 102, 255, 1)',
        pointBackground: 'rgba(153, 102, 255, 1)',
        pointBorder: 'rgba(153, 102, 255, 1)'
    });

    const stalledPrCtx = document.getElementById('stalledPullRequestsChart').getContext('2d');
    renderChart(stalledPrCtx, stalledPrDates, stalledPrCounts, 'bar', `Number of Stalled Open Pull Requests Over Time (Total number of open PRs = ${totalStalledPRs})`, 'day', {
        background: 'rgba(255, 99, 132, 0.2)',
        border: 'rgba(255, 99, 132, 1)',
        pointBackground: 'rgba(255, 99, 132, 1)',
        pointBorder: 'rgba(255, 99, 132, 1)'
    });


}

main();
