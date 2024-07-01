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

function renderChart(ctx, labels, datasets, type, title, unit, options) {
    console.log('Rendering chart:', title);

    const chart = new Chart(ctx, {
        type: type,
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: title,
                    font: {
                        size: 16
                    }
                },
                legend: {
                    display: true
                }
            },
            scales: {
                x: {
                    stacked: options.stacked,
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
                    stacked: options.stacked,
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

    const filteredProjectsData = projectsData.filter(entry => entry.subdirsCount > 0);
    const filteredPullRequestsData = pullRequestsData.filter(entry => entry[1] > 0);
    const filteredStalledPullRequestsData = stalledPullRequestsData.filter(entry => entry[1] > 0);

    const projectDates = filteredProjectsData.map(entry => new Date(entry.date));
    const projectCounts = filteredProjectsData.map(entry => entry.subdirsCount);
    const prDates = filteredPullRequestsData.map(entry => new Date(entry[0]));
    const prCounts = filteredPullRequestsData.map(entry => entry[1]);
    const stalledPrDates = filteredStalledPullRequestsData.map(entry => new Date(entry[0]));
    const stalledPrCounts = filteredStalledPullRequestsData.map(entry => entry[1]);

    const totalGrants = projectCounts[projectCounts.length - 1];
    const totalOpenPRs = prCounts[prCounts.length - 1];
    const totalStalledPRs = stalledPrCounts[stalledPrCounts.length - 1];

    const projectsCtx = document.getElementById('projectsChart').getContext('2d');
    renderChart(projectsCtx, projectDates, [{
        label: 'Funded Projects',
        data: projectCounts,
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        pointBackgroundColor: 'rgba(75, 192, 192, 1)',
        pointBorderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: true
    }], 'line', `Number of Funded Projects Over Time (Total number of grants given = ${totalGrants})`, 'month', {
        stacked: false
    });

    const prCtx = document.getElementById('pullRequestsChart').getContext('2d');
    renderChart(prCtx, prDates, [{
        label: 'Open Pull Requests',
        data: prCounts,
        backgroundColor: 'rgba(153, 102, 255, 0.2)',
        borderColor: 'rgba(153, 102, 255, 1)',
        pointBackgroundColor: 'rgba(153, 102, 255, 1)',
        pointBorderColor: 'rgba(153, 102, 255, 1)',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: true
    }], 'bar', `Number of Open Pull Requests Over Time (Total number of open PRs = ${totalOpenPRs})`, 'day', {
        stacked: false
    });


    const combinedPrCtx = document.getElementById('stalledPullRequestsChart').getContext('2d');
    renderChart(combinedPrCtx, stalledPrDates, [
        {
            label: 'Stalled Pull Requests',
            data: stalledPrCounts,
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 2
        },
        {
            label: 'Open Pull Requests',
            data: prCounts,
            backgroundColor: 'rgba(153, 102, 255, 0.2)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 2
        }
    ], 'bar', `Number of Open and Stalled Pull Requests Over Time (Total number of open PRs = ${totalOpenPRs}, Total number of stalled PRs = ${totalStalledPRs})`, 'day', {
        stacked: true
    });
}

main();
